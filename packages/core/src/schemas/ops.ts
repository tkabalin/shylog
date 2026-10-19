import { z } from "zod"

import { idSchema } from "../ids.ts"
import { diveFieldsSchema } from "./dive.ts"
import { entityFields, type EntityKind } from "./entities.ts"

// Ops only carry offline drafts to the server. The server accepts this
// version and the one before, so installed copies running older code can
// still upload.
export const opVersion = 1

const base = {
  opId: idSchema("op"),
  opVersion: z.int().positive(),
  deviceId: idSchema("device"),
  // The device's clock as an instant, for the server's two-year age rule.
  at: z.iso.datetime({ offset: true }),
}

const upsertDive = z.strictObject({
  ...base,
  type: z.literal("upsertDive"),
  diveId: idSchema("dive"),
  fields: diveFieldsSchema,
})

const upsertEntity = <K extends EntityKind>(kind: K) =>
  z.strictObject({
    ...base,
    type: z.literal("upsertEntity"),
    kind: z.literal(kind),
    id: idSchema(kind),
    fields: entityFields[kind],
  })

export const opSchema = z.discriminatedUnion("type", [
  upsertDive,
  z.discriminatedUnion("kind", [
    upsertEntity("site"),
    upsertEntity("region"),
    upsertEntity("person"),
    upsertEntity("diveCentre"),
    upsertEntity("trip"),
  ]),
])
export type Op = z.output<typeof opSchema>

// `POST /api/ops`: one draft, which is one dive and the entities it creates.
export const uploadDraftRequest = z
  .strictObject({ ops: z.array(opSchema).min(1) })
  .refine(
    ({ ops }) => ops.filter((op) => op.type === "upsertDive").length === 1,
    "A draft holds exactly one dive"
  )
  .refine(
    ({ ops }) => new Set(ops.map((op) => op.opId)).size === ops.length,
    "Op ids must be unique"
  )
export type UploadDraftRequest = z.output<typeof uploadDraftRequest>
