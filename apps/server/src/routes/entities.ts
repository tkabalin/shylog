import {
  entityKinds,
  idSchema,
  mergeEntityRequests,
  setEntityDivesRequests,
  type DiveSetKind,
  type EntityKind,
} from "@shylog/core"
import { validator } from "hono/validator"
import { z } from "zod"

import {
  deleteEntity,
  feedsDiveFigures,
  refuseUnknownSite,
} from "../apply/entity.ts"
import { Rejected } from "../apply/rejected.ts"
import { applyEntityDives, applyEntityMerge, applyEntityPut } from "../edits.ts"
import { factory } from "../factory.ts"
import { json, parse } from "../validate.ts"
import { change, changeBy } from "./change.ts"

// The kind and an id of that kind, which the prefix makes checkable.
const target = validator("param", (value: Record<string, string>) => {
  const kind = z.enum(entityKinds).safeParse(value.kind)
  if (!kind.success) throw new Rejected("No such kind of entity", 404)
  return {
    kind: kind.data as EntityKind,
    id: parse(idSchema(kind.data), value.id) as string,
  }
})

// Renames, merges and deletes from Settings, and creates for a new id,
// alone or with the dives a new trip, dive centre or person is on.
// The body is checked inside the write, as which schema applies depends on
// whether the entity exists.
export const entities = factory
  .createApp()
  .put("/entities/:kind/:id", target, json(z.unknown()), (c) => {
    const { db } = c.var.deps
    const { kind, id } = c.req.valid("param")
    const fields = c.req.valid("json")
    return c.json(
      changeBy(
        db,
        (journal) => applyEntityPut(db, journal, kind, id, fields),
        feedsDiveFigures(kind, fields)
      )
    )
  })
  .post("/entities/:kind/:id/merge", target, json(z.unknown()), (c) => {
    const { db } = c.var.deps
    const { kind, id } = c.req.valid("param")
    const { into } = parse(mergeEntityRequests[kind], c.req.valid("json"))
    return c.json(
      changeBy(
        db,
        (journal) => applyEntityMerge(db, journal, kind, id, into),
        feedsDiveFigures(kind)
      )
    )
  })
  .post("/entities/:kind/:id/dives", target, json(z.unknown()), (c) => {
    const { db } = c.var.deps
    const { kind, id } = c.req.valid("param")
    if (!(kind in setEntityDivesRequests)) {
      throw new Rejected("Only trips, dive centres and people", 404)
    }
    const setKind = kind as DiveSetKind
    const request = parse(setEntityDivesRequests[setKind], c.req.valid("json"))
    // Always the derived pass, as for any dive edit: saving a dive leaves
    // its calculated surface interval to it.
    return c.json(
      changeBy(db, (journal) =>
        applyEntityDives(db, journal, setKind, id, request)
      )
    )
  })
  .delete("/entities/:kind/:id", target, (c) => {
    const { db } = c.var.deps
    const { kind, id } = c.req.valid("param")
    return c.json(
      change(
        db,
        () => {
          refuseUnknownSite(db, kind, [id])
          return deleteEntity(db, kind, id)
        },
        { type: "deleteEntity", payload: { kind, id } },
        feedsDiveFigures(kind)
      )
    )
  })
