import {
  defaultWaterType,
  entityFields,
  normaliseName,
  placeKey,
  putEntityRequests,
  type BodyOfWater,
  type EntityKind,
  type Op,
} from "@shylog/core"

import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"
import type { Entry } from "../journal.ts"
import { parse } from "../validate.ts"
import { Rejected } from "./rejected.ts"

export type EntityOp = Extract<Op, { type: "upsertEntity" }>

// Only sites (water type) and trips (CNS carry-over) feed dive figures, so
// only their edits run the derived pass, which reads every dive's samples.
export const feedsDiveFigures = (kind: EntityKind) =>
  kind === "site" || kind === "trip"

export const tables = {
  site: "sites",
  region: "regions",
  person: "people",
  diveCentre: "dive_centres",
  trip: "trips",
} satisfies Record<EntityKind, string>

export const nouns = {
  site: "site",
  region: "region",
  person: "person",
  diveCentre: "dive centre",
  trip: "trip",
} satisfies Record<EntityKind, string>

// Each kind's columns under core's field names, so one insert and one update
// serve drafts and edits alike.
const columns = {
  site: {
    name: "name",
    countryCode: "country_code",
    regionId: "region_id",
    bodyOfWater: "body_of_water",
    waterType: "water_type",
  },
  region: { name: "name", countryCode: "country_code" },
  person: { name: "name" },
  diveCentre: { name: "name", regionId: "region_id" },
  trip: { name: "name" },
} satisfies Record<EntityKind, Record<string, string>>

type Fields = Record<string, string>

const gone = {
  site: "The site was deleted",
  region: "The region was deleted",
  person: "A person on this dive was deleted",
  diveCentre: "The dive centre was deleted",
  trip: "The trip was deleted",
} satisfies Record<EntityKind, string>

const has = (db: Db, kind: EntityKind, id: string) =>
  prepared(db, `SELECT 1 FROM ${tables[kind]} WHERE id = ?`).get(id) !==
  undefined

// The entity an id names now, following aliases left by merges, which may
// chain. Null for an id that names nothing, such as a deleted entity.
export function resolve(db: Db, kind: EntityKind, id: string): string | null {
  const seen = new Set<string>()
  for (let current = id; !seen.has(current);) {
    seen.add(current)
    if (has(db, kind, current)) return current
    const target = prepared(
      db,
      "SELECT target_id FROM aliases WHERE id = ? AND kind = ?"
    )
      .pluck()
      .get(current, kind) as string | undefined
    if (target === undefined) return null
    current = target
  }
  return null
}

export function existing(
  db: Db,
  kind: EntityKind,
  id: string,
  path: PropertyKey[]
): string {
  const found = resolve(db, kind, id)
  if (found == null) throw new Rejected(gone[kind], 422, path)
  return found
}

const isAlias = (db: Db, id: string) =>
  prepared(db, "SELECT 1 FROM aliases WHERE id = ?").get(id) !== undefined

export function addAlias(db: Db, kind: EntityKind, id: string, target: string) {
  prepared(
    db,
    "INSERT INTO aliases (id, kind, target_id) VALUES (?, ?, ?)"
  ).run(id, kind, target)
}

const isDeleted = (db: Db, kind: EntityKind, id: string) =>
  prepared(db, "SELECT 1 FROM deleted_entities WHERE id = ? AND kind = ?").get(
    id,
    kind
  ) !== undefined

// For an id that is not in its table: why a request can't use it, or null
// for one the server has never seen.
function retired(db: Db, kind: EntityKind, id: string): Rejected | null {
  if (isAlias(db, id)) {
    return new Rejected(`This ${nouns[kind]} was merged into another`, 409)
  }
  if (isDeleted(db, kind, id)) {
    return new Rejected(`This ${nouns[kind]} was deleted`, 409)
  }
  return null
}

export const missing = (db: Db, kind: EntityKind, id: string) =>
  retired(db, kind, id) ?? new Rejected(`No such ${nouns[kind]}`, 404)

export const regionCountry = (db: Db, id: string) =>
  prepared(db, "SELECT country_code FROM regions WHERE id = ?")
    .pluck()
    .get(id) as string | undefined

const keyOf = (kind: EntityKind, fields: Fields) =>
  kind === "site" || kind === "region"
    ? placeKey(fields.name, fields.countryCode)
    : normaliseName(fields.name)

function clashing(db: Db, kind: EntityKind, key: string, id: string) {
  return prepared<[string, string], { id: string; name: string }>(
    db,
    `SELECT id, name FROM ${tables[kind]} WHERE key = ? AND id != ?`
  ).get(key, id)
}

function stored(db: Db, kind: EntityKind, id: string): Fields {
  const row = prepared<[string], Record<string, string | null>>(
    db,
    `SELECT ${Object.entries(columns[kind])
      .map(([field, column]) => `${column} AS ${field}`)
      .join(", ")} FROM ${tables[kind]} WHERE id = ?`
  ).get(id)!
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value != null)
  ) as Fields
}

// Inserts or updates one entity after the checks that need stored rows: a
// region that exists and is in the site's country, and, when a region
// changes country, the same move for its sites (see Rules for edits).
function save(
  db: Db,
  kind: EntityKind,
  id: string,
  fields: Fields,
  key: string,
  before: Fields | null,
  at: PropertyKey[] = []
) {
  const next = { ...fields }
  if (next.regionId) {
    const path = [...at, "regionId"]
    next.regionId = existing(db, "region", next.regionId, path)
    if (
      kind === "site" &&
      regionCountry(db, next.regionId) !== next.countryCode
    ) {
      throw new Rejected("The region is in another country", 422, path)
    }
  }
  if (kind === "region" && before && before.countryCode !== next.countryCode) {
    moveSites(db, id, next.countryCode)
  }

  const names = Object.keys(columns[kind]) as (keyof Fields)[]
  const values = names.map((field) => next[field] ?? null)
  const cols = Object.values(columns[kind])
  if (before) {
    prepared(
      db,
      `UPDATE ${tables[kind]} SET key = ?, ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`
    ).run(key, ...values, id)
  } else {
    prepared(
      db,
      `INSERT INTO ${tables[kind]} (id, key, ${cols.join(", ")}) VALUES (?, ?, ${cols.map(() => "?").join(", ")})`
    ).run(id, key, ...values)
  }
}

function moveSites(db: Db, regionId: string, countryCode: string) {
  const sites = prepared<[string], { id: string; name: string }>(
    db,
    "SELECT id, name FROM sites WHERE region_id = ?"
  ).all(regionId)
  for (const site of sites) {
    const key = placeKey(site.name, countryCode)
    const other = clashing(db, "site", key, site.id)
    if (other) {
      throw new Rejected(
        `A site in that country is already called ${other.name}`,
        409,
        ["countryCode"],
        { conflict: other }
      )
    }
    prepared(db, "UPDATE sites SET key = ?, country_code = ? WHERE id = ?").run(
      key,
      countryCode,
      site.id
    )
  }
}

// A draft creates entities only: a known id is used as it is, since renames
// are made online, and a retired one is refused. A new one matching another
// entity's key becomes its alias (see Conflict rules in the spec).
export function applyEntityOp(
  db: Db,
  op: EntityOp,
  journal: (entry: Entry) => void
) {
  if (resolve(db, op.kind, op.id) == null) {
    if (retired(db, op.kind, op.id)) throw new Rejected(gone[op.kind])
    const fields = op.fields as Fields
    const key = keyOf(op.kind, fields)
    const match = clashing(db, op.kind, key, op.id)
    if (match !== undefined) {
      addAlias(db, op.kind, op.id, match.id)
      journal({
        type: "alias",
        payload: { kind: op.kind, id: op.id, target: match.id },
      })
    } else {
      save(db, op.kind, op.id, fields, key, null, ["fields"])
    }
  }
  journal({ type: op.type, payload: op, opId: op.opId })
}

// `PUT /api/entities/:kind/:id`: a new id creates the entity from the full
// fields (D6), a known one takes the changed fields. True when it changed
// anything, so a repeated save writes nothing.
export function putEntity(
  db: Db,
  kind: EntityKind,
  id: string,
  body: unknown
): boolean {
  const known = has(db, kind, id)
  const refused = known ? null : retired(db, kind, id)
  if (refused) throw refused
  const before = known ? stored(db, kind, id) : null
  let fields: Fields
  if (before) {
    fields = { ...before }
    const request: Record<string, unknown> = parse(
      putEntityRequests[kind],
      body
    )
    for (const [field, value] of Object.entries(request)) {
      if (value === null) delete fields[field]
      else if (value !== undefined) fields[field] = value as string
    }
    // A new body of water switches the water type, as on a new site, unless
    // the request sets one. Resending the stored one or clearing it doesn't.
    if (
      fields.bodyOfWater &&
      fields.bodyOfWater !== before.bodyOfWater &&
      request.waterType === undefined
    ) {
      fields.waterType = defaultWaterType(fields.bodyOfWater as BodyOfWater)
    }
    // A stale copy may still name a merged-away region.
    if (fields.regionId) {
      fields.regionId = existing(db, "region", fields.regionId, ["regionId"])
    }
    const names = new Set([...Object.keys(before), ...Object.keys(fields)])
    if ([...names].every((field) => before[field] === fields[field])) {
      return false
    }
  } else {
    fields = parse(entityFields[kind], body) as Fields
  }
  const key = keyOf(kind, fields)
  const other = clashing(db, kind, key, id)
  // Naming the entity holding the key, so the form can offer to merge into
  // it instead.
  if (other) {
    throw new Rejected(
      `There is already a ${nouns[kind]} called ${other.name}`,
      409,
      ["name"],
      { conflict: other }
    )
  }
  save(db, kind, id, fields, key, before)
  return true
}

// What can still use each kind, counting dives in Recently deleted. A trip
// is never in the way, since deleting it unlinks its dives.
const users = {
  site: [["dive", "SELECT count(*) FROM dives WHERE site_id = :id"]],
  region: [
    ["site", "SELECT count(*) FROM sites WHERE region_id = :id"],
    ["dive centre", "SELECT count(*) FROM dive_centres WHERE region_id = :id"],
  ],
  person: [
    [
      "dive",
      `SELECT count(*) FROM (SELECT dive_id FROM dive_buddies WHERE person_id = :id
         UNION SELECT dive_id FROM dive_professionals WHERE person_id = :id)`,
    ],
  ],
  diveCentre: [
    ["dive", "SELECT count(*) FROM dives WHERE dive_centre_id = :id"],
  ],
} satisfies Record<Exclude<EntityKind, "trip">, [string, string][]>

function uses(db: Db, kind: keyof typeof users, id: string) {
  return users[kind]
    .map(
      ([noun, sql]) => [noun, prepared(db, sql).pluck().get({ id })] as const
    )
    .filter(([, n]) => n !== 0)
    .map(([noun, n]) => `${n} ${noun}${n === 1 ? "" : "s"}`)
    .join(" and ")
}

// `DELETE /api/entities/:kind/:id`. A trip unlinks its dives; anything else
// still in use is refused, to be merged instead. True when it deleted
// something, so a repeated delete writes nothing.
export function deleteEntity(db: Db, kind: EntityKind, id: string): boolean {
  if (!has(db, kind, id)) {
    if (isDeleted(db, kind, id)) return false
    throw missing(db, kind, id)
  }
  if (kind === "trip") {
    // As for any field cleared by hand that has no computer value.
    prepared(
      db,
      "DELETE FROM field_meta WHERE field = 'tripId' AND dive_id IN (SELECT id FROM dives WHERE trip_id = ?)"
    ).run(id)
    prepared(db, "UPDATE dives SET trip_id = NULL WHERE trip_id = ?").run(id)
  } else {
    const used = uses(db, kind, id)
    if (used !== "") {
      throw new Rejected(
        `This ${nouns[kind]} is still used by ${used}, so it can only be merged into another`,
        409
      )
    }
  }
  prepared(db, `DELETE FROM ${tables[kind]} WHERE id = ?`).run(id)
  prepared(db, "INSERT INTO deleted_entities (id, kind) VALUES (?, ?)").run(
    id,
    kind
  )
  return true
}
