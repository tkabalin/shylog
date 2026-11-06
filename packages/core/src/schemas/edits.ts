import { z } from "zod"

import { idSchema, type Id } from "../ids.ts"
import { patchShape, uniqueList } from "./common.ts"
import { comparedFields, diveFieldsPatch } from "./dive.ts"
import {
  entityFields,
  entityShapes,
  type EntityKind,
  type EntityShape,
} from "./entities.ts"
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
// then checks the body against the full `entityFields` instead. Only the
// server knows a site's stored body of water, so it re-derives the water type.
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
  site: putEntity(entityShapes.site),
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

// `POST /api/entities/:kind/:id/dives` sets which dives a trip, dive centre
// or person is on, in one write. A new one comes with its fields and at
// least one dive, so nothing is ever saved with none. `deleteIfEmpty` asks
// for it to go once nothing uses it, after the diver confirmed.
export const diveRoles = ["buddy", "professional"] as const
export type DiveRole = (typeof diveRoles)[number]

const setEntityDives = <F extends z.ZodType, A extends z.ZodType>(
  fields: F,
  add: A,
  diveOf: (item: z.output<A>) => string
) =>
  z
    .strictObject({
      create: fields.optional(),
      add: z.array(add).default([]),
      remove: uniqueList(idSchema("dive")).default([]),
      deleteIfEmpty: z.boolean().default(false),
    })
    .refine(
      ({ create, add }) => !create || add.length > 0,
      "A new one needs at least one dive"
    )
    .refine(({ add, remove }) => {
      const ids = add.map(diveOf)
      return (
        new Set(ids).size === ids.length &&
        !ids.some((id) => remove.includes(id as Id<"dive">))
      )
    }, "A dive is either added or removed")
    .refine(
      ({ create, add, remove, deleteIfEmpty }) =>
        create !== undefined ||
        add.length > 0 ||
        remove.length > 0 ||
        deleteIfEmpty,
      "Nothing to change"
    )

export const setEntityDivesRequests = {
  trip: setEntityDives(entityFields.trip, idSchema("dive"), (id) => id),
  diveCentre: setEntityDives(
    entityFields.diveCentre,
    idSchema("dive"),
    (id) => id
  ),
  person: setEntityDives(
    entityFields.person,
    z.strictObject({ diveId: idSchema("dive"), role: z.enum(diveRoles) }),
    (item) => item.diveId
  ),
}
export type DiveSetKind = keyof typeof setEntityDivesRequests
// As the server reads it, defaults filled in.
export type SetEntityDivesParsed = z.output<
  (typeof setEntityDivesRequests)[DiveSetKind]
>
export type SetEntityDivesRequest<K extends DiveSetKind> = z.input<
  (typeof setEntityDivesRequests)[K]
>

// `PUT /api/settings`. New-dive defaults are replaced as a whole.
export const putSettingsRequest = z
  .strictObject(settingsFields)
  .partial()
  .refine(notEmpty, "Nothing to change")
export type PutSettingsRequest = z.output<typeof putSettingsRequest>
