import { normaliseName, placeKey, type EntityKind, type Op } from "@shylog/core"

import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"
import type { Entry } from "../journal.ts"
import { Rejected } from "./rejected.ts"

export type EntityOp = Extract<Op, { type: "upsertEntity" }>

const tables = {
  site: "sites",
  region: "regions",
  person: "people",
  diveCentre: "dive_centres",
  trip: "trips",
} satisfies Record<EntityKind, string>

const gone = {
  site: "The site was deleted",
  region: "The region was deleted",
  person: "A person on this dive was deleted",
  diveCentre: "The dive centre was deleted",
  trip: "The trip was deleted",
} satisfies Record<EntityKind, string>

// The entity an id names now, following aliases left by merges, which may
// chain. Null for an id that names nothing, such as a deleted entity.
export function resolve(db: Db, kind: EntityKind, id: string): string | null {
  const seen = new Set<string>()
  for (let current = id; !seen.has(current);) {
    seen.add(current)
    if (prepared(db, `SELECT 1 FROM ${tables[kind]} WHERE id = ?`).get(current))
      return current
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

// An id the server has known, as an alias or from an earlier draft, but that
// names nothing now was deleted, and a re-sent draft must not bring it back.
const seenBefore = (db: Db, kind: EntityKind, id: string) =>
  prepared(db, "SELECT 1 FROM aliases WHERE id = ?").get(id) !== undefined ||
  prepared(
    db,
    "SELECT 1 FROM ops WHERE type = 'upsertEntity' AND payload ->> '$.kind' = ? AND payload ->> '$.id' = ?"
  ).get(kind, id) !== undefined

const keyOf = (op: EntityOp) =>
  op.kind === "site" || op.kind === "region"
    ? placeKey(op.fields.name, op.fields.countryCode)
    : normaliseName(op.fields.name)

// A draft creates entities only: an id the server already knows is used as
// it is, since renames are made online. A new one that matches an existing
// entity's key becomes an alias of it (see Conflict rules in the spec).
export function applyEntityOp(
  db: Db,
  op: EntityOp,
  journal: (entry: Entry) => void
) {
  if (resolve(db, op.kind, op.id) == null) {
    if (seenBefore(db, op.kind, op.id)) throw new Rejected(gone[op.kind])
    const key = keyOf(op)
    const match = prepared(
      db,
      `SELECT id FROM ${tables[op.kind]} WHERE key = ?`
    )
      .pluck()
      .get(key) as string | undefined
    if (match !== undefined) {
      prepared(
        db,
        "INSERT INTO aliases (id, kind, target_id) VALUES (?, ?, ?)"
      ).run(op.id, op.kind, match)
      journal({
        type: "alias",
        payload: { kind: op.kind, id: op.id, target: match },
      })
    } else {
      insert(db, op, key)
    }
  }
  journal({ type: op.type, payload: op, opId: op.opId })
}

function insert(db: Db, op: EntityOp, key: string) {
  const path = ["fields", "regionId"]
  switch (op.kind) {
    case "region":
      prepared(
        db,
        "INSERT INTO regions (id, name, key, country_code) VALUES (?, ?, ?, ?)"
      ).run(op.id, op.fields.name, key, op.fields.countryCode)
      return
    case "site": {
      const { name, countryCode, regionId, bodyOfWater, waterType } = op.fields
      const region = regionId && existing(db, "region", regionId, path)
      if (
        region &&
        prepared(db, "SELECT country_code FROM regions WHERE id = ?")
          .pluck()
          .get(region) !== countryCode
      ) {
        throw new Rejected("The region is in another country", 422, path)
      }
      prepared(
        db,
        "INSERT INTO sites (id, name, key, country_code, region_id, body_of_water, water_type) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(
        op.id,
        name,
        key,
        countryCode,
        region ?? null,
        bodyOfWater ?? null,
        waterType
      )
      return
    }
    case "diveCentre": {
      const { regionId } = op.fields
      prepared(
        db,
        "INSERT INTO dive_centres (id, name, key, region_id) VALUES (?, ?, ?, ?)"
      ).run(
        op.id,
        op.fields.name,
        key,
        regionId ? existing(db, "region", regionId, path) : null
      )
      return
    }
    case "person":
    case "trip":
      prepared(
        db,
        `INSERT INTO ${tables[op.kind]} (id, name, key) VALUES (?, ?, ?)`
      ).run(op.id, op.fields.name, key)
  }
}
