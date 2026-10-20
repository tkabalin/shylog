import type { EntityKind } from "@shylog/core"

import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"
import { Rejected } from "./rejected.ts"

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
