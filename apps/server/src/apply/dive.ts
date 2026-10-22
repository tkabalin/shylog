import {
  diveFieldsSchema,
  type DiveFields,
  type EntityKind,
  type PatchDiveRequest,
} from "@shylog/core"

import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"
import { existing } from "./entity.ts"
import {
  adopted,
  computerValue,
  dismiss,
  handEdit,
  metaOf,
  type Meta,
  recordHand,
  sqlValue,
} from "./field-meta.ts"
import { Rejected } from "./rejected.ts"

// Dive fields with a column of their own, named in snake_case.
const columnFields = [
  "startTime",
  "siteId",
  "duration",
  "maxDepth",
  "diveType",
  "trainingAgency",
  "trainingCourse",
  "tripId",
  "diveCentreId",
  "entry",
  "current",
  "surge",
  "surface",
  "weather",
  "minTemperature",
  "maxTemperature",
  "visibility",
  "visibilityRating",
  "workload",
  "thermalComfort",
  "averageDepth",
  "weight",
  "cylinderMaterial",
  "cylinderVolume",
  "nitrox",
  "oxygen",
  "startPressure",
  "endPressure",
  "notableAnimals",
  "gearDetails",
  "notes",
  "ignored",
] as const satisfies (keyof DiveFields)[]
const people = {
  buddies: "dive_buddies",
  diveProfessionals: "dive_professionals",
}
const links = {
  siteId: "site",
  tripId: "trip",
  diveCentreId: "diveCentre",
} satisfies Partial<Record<keyof DiveFields, EntityKind>>
const column = (field: string) =>
  field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
const booleans = new Set<string>(["nitrox", "ignored"])

// A dive's fields as a draft would carry them, with absent meaning empty.
type Fields = Partial<Record<keyof DiveFields, unknown>>

interface Stored {
  fields: Fields
  deleted: boolean
}

// Built once, as the statement cache is keyed by the SQL.
const selectDive = `SELECT ${columnFields.map((field) => `${column(field)} AS ${field}`).join(", ")},
    surface_interval AS surfaceInterval,
    surface_interval_override AS override, deleted_at AS deletedAt
  FROM dives WHERE id = ?`
const names = columnFields.map(column)
const writeDive = `INSERT INTO dives (id, ${names.join(", ")}, surface_interval,
    surface_interval_override)
  VALUES (@id, ${columnFields.map((field) => `@${field}`).join(", ")},
    @surfaceInterval, @override)
  ON CONFLICT (id) DO UPDATE SET
    ${names.map((name) => `${name} = excluded.${name}`).join(", ")},
    surface_interval = excluded.surface_interval,
    surface_interval_override = excluded.surface_interval_override`

function stored(db: Db, id: string, meta: Map<string, Meta>): Stored | null {
  const row = prepared<[string], Record<string, unknown>>(db, selectDive).get(
    id
  )
  if (!row) return null
  const fields: Fields = {}
  for (const field of columnFields) {
    const value = row[field]
    if (value != null) fields[field] = booleans.has(field) ? value === 1 : value
  }
  // Only an override is the diver's; otherwise the interval is derived.
  if (row.override) fields.surfaceInterval = row.surfaceInterval ?? "none"
  // Likewise an average depth with no source, which the samples gave.
  if (!meta.has("averageDepth")) delete fields.averageDepth
  for (const [field, table] of Object.entries(people)) {
    const ids = prepared(
      db,
      `SELECT person_id FROM ${table} WHERE dive_id = ? ORDER BY position`
    )
      .pluck()
      .all(id)
    if (ids.length) fields[field as keyof Fields] = ids
  }
  const tags = prepared(
    db,
    "SELECT tag FROM dive_tags WHERE dive_id = ? ORDER BY tag"
  )
    .pluck()
    .all(id)
  if (tags.length) fields.tags = tags
  return { fields, deleted: row.deletedAt != null }
}

// Links through aliases to the entities that survived merges, then checks the
// whole dive with core's schema, so rules spanning fields hold against stored
// values too. Empty values are dropped and tags sorted, so a field compares
// equal to its stored self.
function valid(db: Db, fields: Fields): Fields {
  // Absent is empty: core's output has nulls for emptied text boxes.
  const resolved = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value != null)
  ) as Fields
  for (const [field, kind] of Object.entries(links) as [
    keyof typeof links,
    EntityKind,
  ][]) {
    const id = fields[field]
    if (typeof id === "string") {
      resolved[field] = existing(db, kind, id, ["fields", field])
    }
  }
  for (const field of Object.keys(people) as (keyof typeof people)[]) {
    const ids = fields[field] as string[] | undefined
    // Two drafts' people may have matched the same person.
    if (ids) {
      resolved[field] = [
        ...new Set(
          ids.map((id, i) => existing(db, "person", id, ["fields", field, i]))
        ),
      ]
    }
  }
  const parsed = diveFieldsSchema.safeParse(resolved)
  if (!parsed.success) {
    const [issue] = parsed.error.issues
    throw new Rejected(issue.message, 422, ["fields", ...issue.path])
  }
  const out: Fields = {}
  for (const [field, value] of Object.entries(parsed.data)) {
    if (value == null || (Array.isArray(value) && !value.length)) continue
    out[field as keyof Fields] =
      field === "tags" && Array.isArray(value) ? [...value].sort() : value
  }
  return out
}

function save(db: Db, id: string, fields: Fields) {
  const override = fields.surfaceInterval !== undefined
  const values: Record<string, unknown> = {
    id,
    surfaceInterval:
      fields.surfaceInterval === "none"
        ? null
        : (fields.surfaceInterval ?? null),
    override: Number(override),
  }
  for (const field of columnFields) {
    values[field] = sqlValue(fields[field] ?? null)
  }
  // Derived columns (number, CNS, a calculated interval) are left to the
  // derived pass that follows every write.
  prepared(db, writeDive).run(values)

  for (const [field, table] of Object.entries(people)) {
    prepared(db, `DELETE FROM ${table} WHERE dive_id = ?`).run(id)
    const ids = (fields[field as keyof Fields] as string[] | undefined) ?? []
    ids.forEach((person, position) =>
      prepared(
        db,
        `INSERT INTO ${table} (dive_id, person_id, position) VALUES (?, ?, ?)`
      ).run(id, person, position)
    )
  }
  prepared(db, "DELETE FROM dive_tags WHERE dive_id = ?").run(id)
  for (const tag of (fields.tags as string[] | undefined) ?? []) {
    prepared(db, "INSERT INTO dive_tags (dive_id, tag) VALUES (?, ?)").run(
      id,
      tag
    )
  }
}

export const diveExists = (db: Db, id: string) =>
  prepared(db, "SELECT 1 FROM dives WHERE id = ?").get(id) !== undefined

// A new dive from a draft: every field filled in is a hand value.
export function createDive(db: Db, id: string, draft: DiveFields) {
  const fields = valid(db, draft)
  save(db, id, fields)
  for (const field of Object.keys(fields)) recordHand(db, id, field)
}

const same = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((value, i) => value === b[i])
    : a === b

// Applies the changed fields, adoptions and dismissals of a synced dive.
// True when anything changed, so a repeated edit writes nothing.
export function editDive(
  db: Db,
  id: string,
  { fields: patch = {}, adopt = [], dismiss: keep = [] }: PatchDiveRequest
): boolean {
  const meta = metaOf(db, id)
  const before = stored(db, id, meta)
  if (!before) throw new Rejected("No such dive", 404)
  if (before.deleted) {
    throw new Rejected("This dive is in Recently deleted", 409)
  }
  // A field already holding the computer's value has nothing to adopt, so a
  // retried adoption changes nothing.
  const adopting = adopt.filter(
    (field) => meta.get(field)?.source !== "computer"
  )

  const next: Fields = { ...before.fields }
  for (const [field, value] of Object.entries(patch)) {
    if (value === null) delete next[field as keyof Fields]
    else if (value !== undefined) next[field as keyof Fields] = value
  }
  for (const field of adopting) {
    next[field] = computerValue(meta.get(field), ["adopt"])
  }
  const after = valid(db, next)

  // Fields that changed, including those dropped with them, such as oxygen
  // when nitrox is turned off.
  const changed = [
    ...new Set([...Object.keys(before.fields), ...Object.keys(after)]),
  ].filter(
    (field) =>
      !same(before.fields[field as keyof Fields], after[field as keyof Fields])
  )
  if (changed.length) save(db, id, after)
  for (const field of changed) {
    if (adopting.includes(field as never)) continue
    const key = field as keyof Fields
    handEdit(db, id, field, before.fields[key], after[key], meta.get(field))
  }
  for (const field of adopting) adopted(db, id, field)
  const dismissed = keep.filter((field) =>
    dismiss(db, id, field, meta.get(field))
  )
  return changed.length > 0 || adopting.length > 0 || dismissed.length > 0
}

// Moves a dive to Recently deleted or back. True when that changed it, so
// doing either twice writes nothing. The time is the journal entry's.
export function setDeleted(
  db: Db,
  id: string,
  deleted: boolean,
  now: Date
): boolean {
  const row = prepared<[string], { deletedAt: string | null }>(
    db,
    "SELECT deleted_at AS deletedAt FROM dives WHERE id = ?"
  ).get(id)
  if (!row) throw new Rejected("No such dive", 404)
  if ((row.deletedAt != null) === deleted) return false
  prepared(db, "UPDATE dives SET deleted_at = ? WHERE id = ?").run(
    deleted ? now.toISOString() : null,
    id
  )
  return true
}
