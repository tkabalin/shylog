import type { EntityKind } from "@shylog/core"

import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"
import {
  addAlias,
  existing,
  missing,
  nouns,
  regionCountry,
  resolve,
  tables,
} from "./entity.ts"
import { Rejected } from "./rejected.ts"

// Where each kind is used, moved onto the survivor by a merge. People are
// moved separately, since a dive can't list one person twice.
const references = {
  site: ["UPDATE dives SET site_id = :into WHERE site_id = :id"],
  region: [
    "UPDATE sites SET region_id = :into WHERE region_id = :id",
    "UPDATE dive_centres SET region_id = :into WHERE region_id = :id",
  ],
  diveCentre: [
    "UPDATE dives SET dive_centre_id = :into WHERE dive_centre_id = :id",
  ],
  trip: ["UPDATE dives SET trip_id = :into WHERE trip_id = :id"],
} satisfies Record<Exclude<EntityKind, "person">, string[]>

// On a dive with both people, the survivor keeps the role and place it had
// there, as one person can't be both buddy and dive professional on a dive.
const movePeople = [
  ...["dive_buddies", "dive_professionals"].map(
    (table) => `DELETE FROM ${table} WHERE person_id = :id AND dive_id IN (
      SELECT dive_id FROM dive_buddies WHERE person_id = :into
      UNION SELECT dive_id FROM dive_professionals WHERE person_id = :into)`
  ),
  "UPDATE dive_buddies SET person_id = :into WHERE person_id = :id",
  "UPDATE dive_professionals SET person_id = :into WHERE person_id = :id",
]

// `POST /api/entities/:kind/:id/merge`: moves everything using `id` onto
// `into` and leaves `id` as its alias, so drafts naming it land on the
// survivor. True when it merged anything, so a retry writes nothing.
export function mergeEntity(
  db: Db,
  kind: EntityKind,
  id: string,
  into: string
): boolean {
  const target = existing(db, kind, into, ["into"])
  const current = resolve(db, kind, id)
  if (current !== id) {
    if (current === target) return false
    throw missing(db, kind, id)
  }
  if (id === target) {
    throw new Rejected(`A ${nouns[kind]} can't be merged into itself`, 422, [
      "into",
    ])
  }
  if (kind === "region") {
    if (regionCountry(db, id) !== regionCountry(db, target)) {
      throw new Rejected("The regions are in different countries", 422, [
        "into",
      ])
    }
  }
  const statements = kind === "person" ? movePeople : references[kind]
  for (const sql of statements) prepared(db, sql).run({ id, into: target })
  prepared(db, `DELETE FROM ${tables[kind]} WHERE id = ?`).run(id)
  addAlias(db, kind, id, target)
  return true
}
