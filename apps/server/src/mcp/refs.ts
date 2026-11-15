import {
  entityCreateOrder,
  isUnknownSite,
  newId,
  unknownSite,
  type EntityKind,
} from "@shylog/core"

import { keyOf, matching, resolve, tables } from "../apply/entity.ts"
import { Rejected } from "../apply/rejected.ts"
import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"
import type { CentreRef, PersonRef, SiteRef, TripRef } from "./units.ts"

type Fields = Record<string, string>

export interface NewEntity {
  kind: EntityKind
  id: string
  fields: Fields
}

const unknownMessage =
  "Unknown site only holds imported dives with no site; give the dive its real site"

export const nameOf = (db: Db, kind: EntityKind, id: string) =>
  prepared(db, `SELECT name FROM ${tables[kind]} WHERE id = ?`)
    .pluck()
    .get(id) as string | undefined

// A tool call's entities: ids used as they are, and new ones matched by
// name to one that exists, as a phone draft's are, or else made under a
// fresh id. The Unknown site an import keeps is never chosen for a dive,
// as the app never offers it.
export function entityRefs(db: Db) {
  const created = new Map<string, NewEntity>()
  const outcome: {
    kind: EntityKind
    id: string
    name: string
    outcome: "created" | "matched"
  }[] = []

  function use(kind: EntityKind, ref: { id: string } | { new: Fields }) {
    if ("id" in ref) {
      if (kind === "site") refuseUnknown(ref.id)
      return ref.id
    }
    const fields = ref.new
    if (kind === "site" && isUnknownSite(fields as typeof unknownSite)) {
      throw new Rejected(unknownMessage, 422, ["site"])
    }
    const match = matching(db, kind, fields)
    if (match !== undefined) {
      if (!outcome.some((entry) => entry.id === match)) {
        outcome.push({
          kind,
          id: match,
          name: nameOf(db, kind, match)!,
          outcome: "matched",
        })
      }
      return match
    }
    // The same new name twice in one call is one entity.
    const key = `${kind}:${keyOf(kind, fields)}`
    const made = created.get(key)
    if (made) return made.id
    const id = newId(kind)
    created.set(key, { kind, id, fields })
    outcome.push({ kind, id, name: fields.name, outcome: "created" })
    return id
  }

  function refuseUnknown(id: string) {
    const unknownId = matching(db, "site", unknownSite)
    if (unknownId !== undefined && resolve(db, "site", id) === unknownId) {
      throw new Rejected(unknownMessage, 422, ["site"])
    }
  }

  return {
    site(ref: SiteRef) {
      if ("id" in ref) return use("site", ref)
      const { region, ...site } = ref.new
      // A site that exists is used as it is, so its new region isn't made.
      if (matching(db, "site", site)) return use("site", { new: site })
      const fields: Fields = { ...site }
      if (region) {
        fields.regionId = use(
          "region",
          "id" in region
            ? region
            : { new: { name: region.new.name, countryCode: site.countryCode } }
        )
      }
      return use("site", { new: fields })
    },
    person: (ref: PersonRef) => use("person", ref),
    trip: (ref: TripRef) => use("trip", ref),
    diveCentre(ref: CentreRef) {
      if ("id" in ref) return use("diveCentre", ref)
      const { region, ...centre } = ref.new
      return use("diveCentre", {
        new: region ? { ...centre, regionId: region.id } : centre,
      })
    },
    // The new entities in the order they must be made: regions first.
    created: () =>
      [...created.values()].sort(
        (a, b) =>
          entityCreateOrder.indexOf(a.kind) - entityCreateOrder.indexOf(b.kind)
      ),
    outcome: () => outcome,
  }
}
