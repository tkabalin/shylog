import {
  entityKinds,
  idSchema,
  mergeEntityRequests,
  type EntityKind,
} from "@shylog/core"
import { validator } from "hono/validator"
import { z } from "zod"

import { deleteEntity, putEntity } from "../apply/entity.ts"
import { mergeEntity } from "../apply/merge.ts"
import { Rejected } from "../apply/rejected.ts"
import { factory } from "../factory.ts"
import { json, parse } from "../validate.ts"
import { change } from "./change.ts"

// The kind and an id of that kind, which the prefix makes checkable.
const target = validator("param", (value: Record<string, string>) => {
  const kind = z.enum(entityKinds).safeParse(value.kind)
  if (!kind.success) throw new Rejected("No such kind of entity", 404)
  return {
    kind: kind.data as EntityKind,
    id: parse(idSchema(kind.data), value.id) as string,
  }
})

// Only sites (water type) and trips (CNS carry-over) feed dive figures, so
// only their edits run the derived pass, which reads every dive's samples.
const derived = (kind: EntityKind) => kind === "site" || kind === "trip"

// Renames, merges and deletes from Settings, and creates for a new id (D6).
// The body is checked inside the write, as which schema applies depends on
// whether the entity exists.
export const entities = factory
  .createApp()
  .put("/entities/:kind/:id", target, json(z.unknown()), (c) => {
    const { db } = c.var.deps
    const { kind, id } = c.req.valid("param")
    const fields = c.req.valid("json")
    return c.json(
      change(
        db,
        () => putEntity(db, kind, id, fields),
        { type: "putEntity", payload: { kind, id, fields } },
        derived(kind)
      )
    )
  })
  .post("/entities/:kind/:id/merge", target, json(z.unknown()), (c) => {
    const { db } = c.var.deps
    const { kind, id } = c.req.valid("param")
    const { into } = parse(mergeEntityRequests[kind], c.req.valid("json"))
    return c.json(
      change(
        db,
        () => mergeEntity(db, kind, id, into),
        { type: "mergeEntity", payload: { kind, id, into } },
        derived(kind)
      )
    )
  })
  .delete("/entities/:kind/:id", target, (c) => {
    const { db } = c.var.deps
    const { kind, id } = c.req.valid("param")
    return c.json(
      change(
        db,
        () => deleteEntity(db, kind, id),
        { type: "deleteEntity", payload: { kind, id } },
        derived(kind)
      )
    )
  })
