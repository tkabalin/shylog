import { randomUUID } from "node:crypto"

import type { EntityKind, Op, PatchDiveRequest, Settings } from "@shylog/core"

import { editDive, setDeleted } from "../apply/dive.ts"
import { applyDiveOp } from "../apply/draft.ts"
import {
  addAlias,
  applyEntityOp,
  deleteEntity,
  feedsDiveFigures,
  putEntity,
} from "../apply/entity.ts"
import { mergeEntity } from "../apply/merge.ts"
import { putSettings } from "../apply/settings.ts"
import {
  removeCard,
  writeCard,
  writeOrder,
  type Image,
} from "../cards/store.ts"
import { migrations, schemaVersion } from "../db/migrate.ts"
import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"
import { recalculate } from "../derived.ts"
import { setMeta } from "../journal.ts"

export interface JournalRow {
  seq: number
  opId: string | null
  type: string
  payload: string
  appliedAt: string
}

/* eslint-disable @typescript-eslint/no-explicit-any -- payloads are the
   server's own journal entries, shaped by the code that wrote them */
type Apply = (db: Db, payload: any, at: Date) => void

// Each entry type applied as the server first applied it, with the time it
// was applied, and whether the derived pass followed. Nothing is
// journalled here: the caller copies the original row.
const entries: Record<
  string,
  { apply: Apply; derived: boolean | ((payload: any) => boolean) }
> = {
  upsertEntity: {
    apply: (db, op: Op & { type: "upsertEntity" }) =>
      applyEntityOp(db, op, () => {}),
    // No dive names a draft's new entity until its dive op, which runs the
    // pass, so the entity rows skip it as applyDraft's single pass did.
    derived: false,
  },
  upsertDive: {
    apply: (db, op: Op & { type: "upsertDive" }) => applyDiveOp(db, op),
    derived: true,
  },
  // Journalled before the upsertEntity that made it, which then finds the
  // alias and changes nothing.
  alias: {
    apply: (
      db,
      { kind, id, target }: { kind: EntityKind; id: string; target: string }
    ) => addAlias(db, kind, id, target),
    derived: false,
  },
  editDive: {
    apply: (
      db,
      { diveId, ...request }: PatchDiveRequest & { diveId: string }
    ) => editDive(db, diveId, request),
    derived: true,
  },
  deleteDive: {
    apply: (db, { diveId }: { diveId: string }, at) =>
      setDeleted(db, diveId, true, at),
    derived: true,
  },
  restoreDive: {
    apply: (db, { diveId }: { diveId: string }, at) =>
      setDeleted(db, diveId, false, at),
    derived: true,
  },
  putEntity: {
    apply: (
      db,
      { kind, id, fields }: { kind: EntityKind; id: string; fields: unknown }
    ) => putEntity(db, kind, id, fields),
    derived: ({ kind }) => feedsDiveFigures(kind),
  },
  mergeEntity: {
    apply: (
      db,
      { kind, id, into }: { kind: EntityKind; id: string; into: string }
    ) => mergeEntity(db, kind, id, into),
    derived: ({ kind }) => feedsDiveFigures(kind),
  },
  deleteEntity: {
    apply: (db, { kind, id }: { kind: EntityKind; id: string }) =>
      deleteEntity(db, kind, id),
    derived: ({ kind }) => feedsDiveFigures(kind),
  },
  putSettings: {
    apply: (db, request: Partial<Settings>) => putSettings(db, request),
    derived: false,
  },
  putCard: {
    apply: (
      db,
      {
        id,
        name,
        images,
        first = false,
      }: { id: string; name: string; images: Image[]; first?: boolean }
    ) => writeCard(db, id, name, images, first),
    derived: false,
  },
  deleteCard: {
    apply: (db, { id }: { id: string }) => removeCard(db, id),
    derived: false,
  },
  orderCards: {
    apply: (db, { ids }: { ids: string[] }) => writeOrder(db, ids),
    derived: false,
  },
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const insertRow = (db: Db, row: JournalRow) =>
  prepared(
    db,
    "INSERT INTO ops (seq, op_id, type, payload, applied_at) VALUES (?, ?, ?, ?, ?)"
  ).run(row.seq, row.opId, row.type, row.payload, row.appliedAt)

// As migrate runs it: foreign keys can only be switched outside a
// transaction, and the check afterwards is the guard.
function applyMigration(db: Db, row: JournalRow) {
  const { version } = JSON.parse(row.payload) as { version: number }
  const migration = migrations.find((m) => m.version === version)
  if (!migration) throw new Error(`No migration ${version} in this server`)
  db.pragma("foreign_keys = OFF")
  try {
    db.transaction(() => {
      migration.up(db)
      setMeta(db, "schema_version", String(migration.version))
      if ((db.pragma("foreign_key_check") as unknown[]).length) {
        throw new Error(`Migration ${migration.version} broke foreign keys`)
      }
      insertRow(db, row)
      setMeta(db, "version", randomUUID())
    })()
  } finally {
    db.pragma("foreign_keys = ON")
  }
}

// One original transaction, such as a whole draft, replayed whole or not at
// all, with one derived pass at the end as the server ran it.
function applyGroup(
  db: Db,
  group: JournalRow[],
  reaching: (row: JournalRow) => void
) {
  if (group[0].type === "migration") return applyMigration(db, group[0])
  // Older entries were written by older code for an older schema, which this
  // server's code can't be trusted to apply.
  const latest = migrations.at(-1)?.version
  if (schemaVersion(db) !== latest) {
    reaching(group[0])
    throw new Error(
      `Written at schema ${schemaVersion(db)}, before this server's ${latest}, so it needs the server version that wrote it`
    )
  }
  db.transaction(() => {
    let derived = false
    for (const row of group) {
      reaching(row)
      const entry = entries[row.type]
      if (!entry) throw new Error(`A ${row.type} entry can't be replayed`)
      const payload = JSON.parse(row.payload)
      entry.apply(db, payload, new Date(row.appliedAt))
      derived ||=
        typeof entry.derived === "function"
          ? entry.derived(payload)
          : entry.derived
      insertRow(db, row)
    }
    if (derived) recalculate(db)
    setMeta(db, "version", randomUUID())
  })()
}

// The server gives each transaction its own time, shared by its entries.
// Migrations always ran alone.
function transactions(rows: JournalRow[]): JournalRow[][] {
  const groups: JournalRow[][] = []
  for (const row of rows) {
    const group = groups.at(-1)
    const joins =
      group?.[0].appliedAt === row.appliedAt &&
      row.type !== "migration" &&
      group[0].type !== "migration"
    if (joins) group.push(row)
    else groups.push([row])
  }
  return groups
}

export interface Replay {
  replayed: JournalRow[]
  // Entries left out, from the one that failed or past `upTo`, for the
  // restore to list.
  notReplayed: JournalRow[]
  failure?: { row: JournalRow; message: string }
}

// The target isn't an earlier copy of the source, so nothing can be replayed.
export class NotInJournal extends Error {}

export const rowsSql =
  "SELECT seq, op_id AS opId, type, payload, applied_at AS appliedAt FROM ops"

// Replays `source`'s journal after `target`'s last entry, up to `upTo`, one
// original transaction at a time with each entry's seq, op id and time, and
// without the op age rules (see Replays in the spec). Stops at a failure.
export function replay(target: Db, source: Db, upTo = Infinity): Replay {
  const after =
    (target.prepare("SELECT max(seq) FROM ops").pluck().get() as
      number | null) ?? 0
  if (after > 0) {
    const mine = target.prepare(`${rowsSql} WHERE seq = ?`).get(after)
    const theirs = source.prepare(`${rowsSql} WHERE seq = ?`).get(after)
    if (JSON.stringify(mine) !== JSON.stringify(theirs)) {
      throw new NotInJournal(
        `The snapshot's last journal entry (${after}) is not in the source database's journal`
      )
    }
  }
  const rows = source
    .prepare(`${rowsSql} WHERE seq > ? ORDER BY seq`)
    .all(after) as JournalRow[]
  const result: Replay = { replayed: [], notReplayed: [] }
  for (const group of transactions(rows)) {
    const from = rows.indexOf(group[0])
    // A sequence number inside a transaction stops before all of it.
    if (group.at(-1)!.seq > upTo) {
      result.notReplayed = rows.slice(from)
      break
    }
    let current = group[0]
    try {
      applyGroup(target, group, (row) => (current = row))
    } catch (error) {
      result.failure = { row: current, message: (error as Error).message }
      result.notReplayed = rows.slice(from)
      break
    }
    result.replayed.push(...group)
  }
  return result
}
