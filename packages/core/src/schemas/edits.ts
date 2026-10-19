import { z } from "zod"

import { defaultWaterType } from "../enums.ts"
import { idSchema } from "../ids.ts"
import { patchShape, uniqueList } from "./common.ts"
import { comparedFields, diveFieldsPatch } from "./dive.ts"
import { entityShapes, type EntityKind, type EntityShape } from "./entities.ts"
import { settingsFields } from "./settings.ts"

// Requests for edits to synced data. Each sends only what changed, so an
// empty request is a mistake on the client.
const notEmpty = (request: object) =>
  Object.values(request).some((value) => value !== undefined)

const compared = uniqueList(z.enum(comparedFields))

// `PATCH /api/dives/:id`. Adopting copies the computer's value over the
// hand value; dismissing keeps the hand value and hides the flag.
export const patchDiveRequest = z
  .strictObject({
    fields: diveFieldsPatch.optional(),
    adopt: compared.optional(),
    dismiss: compared.optional(),
  })
  .refine(
    ({ fields = {}, adopt = [], dismiss = [] }) =>
      notEmpty(fields) || adopt.length > 0 || dismiss.length > 0,
    "Nothing to change"
  )
  .refine(
    ({ fields = {}, adopt = [], dismiss = [] }) =>
      [...adopt, ...dismiss].every((field) => fields[field] === undefined) &&
      adopt.every((field) => !dismiss.includes(field)),
    "A field is either typed, adopted or dismissed"
  )
export type PatchDiveRequest = z.output<typeof patchDiveRequest>

// `PUT /api/entities/:kind/:id`. A new id creates the entity, so the server
// then checks the body against the full `entityFields` instead.
const putEntity = <
  R extends Record<string, z.ZodType>,
  D extends Record<string, z.ZodType>,
  O extends Record<string, z.ZodType>,
>(
  shape: EntityShape<R, D, O>
) =>
  z
    .strictObject(
      patchShape({ ...shape.required, ...shape.defaulted }, shape.optional)
    )
    .refine(notEmpty, "Nothing to change")

export const putEntityRequests = {
  // A new body of water switches the water type, as on a new site, unless
  // the request sets one. Clearing it leaves the water type as it was.
  site: putEntity(entityShapes.site).transform((site) =>
    site.bodyOfWater == null || site.waterType !== undefined
      ? site
      : { ...site, waterType: defaultWaterType(site.bodyOfWater) }
  ),
  region: putEntity(entityShapes.region),
  person: putEntity(entityShapes.person),
  diveCentre: putEntity(entityShapes.diveCentre),
  trip: putEntity(entityShapes.trip),
}

// `POST /api/entities/:kind/:id/merge` merges `:id` into `into`.
const mergeEntity = <K extends EntityKind>(kind: K) =>
  z.strictObject({ into: idSchema(kind) })

export const mergeEntityRequests = {
  site: mergeEntity("site"),
  region: mergeEntity("region"),
  person: mergeEntity("person"),
  diveCentre: mergeEntity("diveCentre"),
  trip: mergeEntity("trip"),
}

// `PUT /api/settings`. New-dive defaults are replaced as a whole.
export const putSettingsRequest = z
  .strictObject(settingsFields)
  .partial()
  .refine(notEmpty, "Nothing to change")
export type PutSettingsRequest = z.output<typeof putSettingsRequest>
