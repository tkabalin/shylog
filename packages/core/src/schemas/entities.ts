import { z } from "zod"

import { bodiesOfWater, defaultWaterType, waterTypes } from "../enums.ts"
import { idSchema } from "../ids.ts"
import { choice, countryCode, name } from "./common.ts"

export const entityKinds = [
  "site",
  "region",
  "person",
  "diveCentre",
  "trip",
] as const
export type EntityKind = (typeof entityKinds)[number]

// Each kind's fields split into required, defaulted (filled in at save, so
// an edit can change but not clear them) and optional, which an edit can
// clear (see patchShape).
type Fields = Record<string, z.ZodType>
export type EntityShape<
  R extends Fields = Fields,
  D extends Fields = Fields,
  O extends Fields = Fields,
> = { required: R; defaulted: D; optional: O }

export const entityShapes = {
  site: {
    required: { name, countryCode },
    defaulted: { waterType: choice(waterTypes) },
    optional: {
      regionId: idSchema("region"),
      bodyOfWater: choice(bodiesOfWater),
    },
  },
  region: { required: { name, countryCode }, defaulted: {}, optional: {} },
  person: { required: { name }, defaulted: {}, optional: {} },
  diveCentre: {
    required: { name },
    defaulted: {},
    optional: { regionId: idSchema("region") },
  },
  trip: { required: { name }, defaulted: {}, optional: {} },
} satisfies Record<EntityKind, EntityShape>

const fieldsOf = <R extends Fields, D extends Fields, O extends Fields>(
  shape: EntityShape<R, D, O>
) =>
  z.strictObject({
    ...shape.required,
    ...z.object({ ...shape.defaulted, ...shape.optional }).partial().shape,
  })

export const entityFields = {
  // Written at save, so the stored water type never depends on code.
  site: fieldsOf(entityShapes.site).transform((site) => ({
    ...site,
    waterType: site.waterType ?? defaultWaterType(site.bodyOfWater),
  })),
  region: fieldsOf(entityShapes.region),
  person: fieldsOf(entityShapes.person),
  diveCentre: fieldsOf(entityShapes.diveCentre),
  trip: fieldsOf(entityShapes.trip),
}
export type EntityFields<K extends EntityKind> = z.output<
  (typeof entityFields)[K]
>
