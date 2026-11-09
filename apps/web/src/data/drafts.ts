import {
  newId,
  opVersion,
  optionalDiveFields,
  uploadDraftRequest,
  type diveFieldsSchema,
  type DiveId,
  type entityFields,
  type EntityKind,
  type Id,
  type opSchema,
} from "@shylog/core"
import { useCallback, useSyncExternalStore } from "react"
import { Dexie, liveQuery, type EntityTable } from "dexie"

// z.input without zod as a dependency. Drafts keep what the form gave, not
// the parsed output, which doesn't parse again: an emptied text field
// becomes null, which a new dive's schema refuses.
type Input<S extends { _zod: { input: unknown } }> = S["_zod"]["input"]

export type DraftFields = Input<typeof diveFieldsSchema>
// A site, region, person, dive centre or trip the dive creates.
export type NewEntity = {
  [K in EntityKind]: {
    kind: K
    id: Id<K>
    fields: Input<(typeof entityFields)[K]>
  }
}[EntityKind]
export type QueuedOp = Input<typeof opSchema>

// A new dive that hasn't uploaded yet, keyed by its dive id.
export interface Draft {
  id: string
  createdAt: string
  updatedAt: string
  fields: DraftFields
  entities: NewEntity[]
  // The server's reason for refusing it, until it is edited.
  rejected?: string
  // Every optional field it has held since it was saved, so an edit can
  // clear on the server those it has lost (see Conflict rules in the spec).
  // Drafts saved before this have only their current fields.
  held?: string[]
}

interface OpRow {
  opId: string
  diveId: string
  op: QueuedOp
}

// The form's unsaved values (see autosave.ts).
export interface SavedForm {
  key: string
  values: unknown
}

// Apart from the log mirror, which a sync clears and replaces, and with its
// own schema version, so newer app code can migrate drafts older code wrote.
// Bump the version when a table or index changes.
export class QueueDb extends Dexie {
  drafts!: EntityTable<Draft, "id">
  ops!: EntityTable<OpRow, "opId">
  meta!: EntityTable<{ key: "device"; id: Id<"device"> }, "key">
  forms!: EntityTable<SavedForm, "key">

  constructor(name = "shylog-queue") {
    super(name)
    this.version(1).stores({
      drafts: "id, createdAt",
      ops: "opId, diveId",
      meta: "key",
      forms: "key",
    })
  }
}

export const queue = new QueueDb()

// Made once per phone, inside the caller's transaction, so two first saves
// can't each make one.
async function deviceId(db: QueueDb) {
  const found = await db.meta.get("device")
  if (found) return found.id
  const id = newId("device")
  await db.meta.add({ key: "device", id })
  return id
}

// Fresh op ids every time, so a rejected draft that is edited sends again
// rather than being skipped as already seen (see Flow in the spec).
async function queueOps(
  db: QueueDb,
  diveId: string,
  fields: DraftFields,
  entities: NewEntity[],
  at: string,
  held: string[] = []
) {
  const device = await deviceId(db)
  const base = () => ({ opId: newId("op"), opVersion, deviceId: device, at })
  // A field the draft has lost goes as null: should its first upload have
  // landed with the reply lost, this one is an edit, which keeps whatever
  // it leaves out. A new dive ignores them.
  const lost = held.filter((field) => !(field in fields))
  const sent = {
    ...fields,
    ...Object.fromEntries(lost.map((field) => [field, null])),
  }
  const ops: QueuedOp[] = [
    // Checked by the parse below.
    {
      ...base(),
      type: "upsertDive",
      diveId: diveId as DiveId,
      fields: sent,
    },
    ...entities.map((entity) => ({
      ...base(),
      type: "upsertEntity" as const,
      ...entity,
    })),
  ]
  // Checked as the server will, so a draft that could never upload isn't
  // kept; a throw here rolls the transaction back.
  uploadDraftRequest.parse({ ops })
  await db.ops.bulkAdd(ops.map((op) => ({ opId: op.opId, diveId, op })))
}

// The optional fields a dive holds: only those can be cleared.
const optional = (fields: DraftFields) =>
  Object.keys(fields).filter((field) => field in optionalDiveFields)

// The draft and its ops in one transaction, so neither is ever saved alone.
export function saveDraft(
  diveId: DiveId,
  fields: DraftFields,
  entities: NewEntity[],
  db: QueueDb = queue
) {
  return db.transaction("rw", db.drafts, db.ops, db.meta, async () => {
    const now = new Date().toISOString()
    await queueOps(db, diveId, fields, entities, now)
    await db.drafts.add({
      id: diveId,
      createdAt: now,
      updatedAt: now,
      fields,
      entities,
      held: optional(fields),
    })
  })
}

// Rewrites the ops and clears a rejection, so the draft queues again. A
// draft that uploaded while the form was open is gone, and its dive is an
// edit to synced data now.
export function editDraft(
  diveId: string,
  fields: DraftFields,
  entities: NewEntity[],
  db: QueueDb = queue
) {
  return db.transaction("rw", db.drafts, db.ops, db.meta, async () => {
    const draft = await db.drafts.get(diveId)
    if (!draft) throw new Error("This dive has uploaded since you opened it")
    const now = new Date().toISOString()
    const held = [
      ...new Set([
        ...(draft.held ?? optional(draft.fields)),
        ...optional(fields),
      ]),
    ]
    await db.ops.where("diveId").equals(diveId).delete()
    await queueOps(db, diveId, fields, entities, now, held)
    await db.drafts.put({
      id: diveId,
      createdAt: draft.createdAt,
      updatedAt: now,
      fields,
      entities,
      held,
    })
  })
}

export function deleteDraft(diveId: string, db: QueueDb = queue) {
  return db.transaction("rw", db.drafts, db.ops, async () => {
    await db.ops.where("diveId").equals(diveId).delete()
    await db.drafts.delete(diveId)
  })
}

// Whether the ops an upload sent are still the queued ones. An edit while
// they were in flight replaced them, and its new ops still need to go.
async function unchanged(db: QueueDb, diveId: string, sent: string[]) {
  const queued = new Set(
    await db.ops.where("diveId").equals(diveId).primaryKeys()
  )
  return sent.every((opId) => queued.has(opId))
}

export function dropDraft(diveId: string, sent: string[], db: QueueDb = queue) {
  return db.transaction("rw", db.drafts, db.ops, async () => {
    if (!(await unchanged(db, diveId, sent))) return
    await db.ops.where("diveId").equals(diveId).delete()
    await db.drafts.delete(diveId)
  })
}

export function rejectDraft(
  diveId: string,
  reason: string,
  sent: string[],
  db: QueueDb = queue
) {
  return db.transaction("rw", db.drafts, db.ops, async () => {
    if (!(await unchanged(db, diveId, sent))) return
    await db.drafts.update(diveId, { rejected: reason })
  })
}

// Oldest first, the order they upload in.
export const listDrafts = (db: QueueDb = queue) =>
  db.drafts.orderBy("createdAt").toArray()

export const readDraft = (diveId: string, db: QueueDb = queue) =>
  db.drafts.get(diveId)

export async function draftOps(diveId: string, db: QueueDb = queue) {
  const rows = await db.ops.where("diveId").equals(diveId).toArray()
  return rows.map((row) => row.op)
}

// The drafts on this phone, and those still to upload (refused ones left
// out), read from the queue itself and kept current, other tabs' saves
// included, which reach this tab's log only when it next loads. Unknown
// until first read. One live query per queue, however many screens ask.
type Counts = { drafts: number; waiting: number }
const counting = new Map<
  QueueDb,
  { counts?: Counts; listeners: Set<() => void>; stop?: () => void }
>()

function countsOf(db: QueueDb) {
  let entry = counting.get(db)
  if (!entry) counting.set(db, (entry = { listeners: new Set() }))
  return entry
}

function subscribeCounts(db: QueueDb, listener: () => void) {
  const entry = countsOf(db)
  entry.listeners.add(listener)
  if (!entry.stop) {
    const set = (counts: Counts) => {
      entry.counts = counts
      for (const each of entry.listeners) each()
    }
    const live = liveQuery(async () => {
      const drafts = await db.drafts.toArray()
      return {
        drafts: drafts.length,
        waiting: drafts.filter((draft) => !draft.rejected).length,
      }
    }).subscribe({
      next: set,
      // A browser that refuses IndexedDB can't have queued anything.
      error: () => set({ drafts: 0, waiting: 0 }),
    })
    entry.stop = () => live.unsubscribe()
  }
  return () => {
    entry.listeners.delete(listener)
    if (entry.listeners.size) return
    entry.stop?.()
    counting.delete(db)
  }
}

export function useQueueCounts(db: QueueDb = queue) {
  const subscribe = useCallback(
    (listener: () => void) => subscribeCounts(db, listener),
    [db]
  )
  return useSyncExternalStore(subscribe, () => counting.get(db)?.counts)
}
