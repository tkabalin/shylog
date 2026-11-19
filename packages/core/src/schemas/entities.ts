import { z } from "zod"

import { bodiesOfWater, defaultWaterType, waterTypes } from "../enums.ts"
import { idSchema } from "../ids.ts"
import { choice, countryCode, name } from "./common.ts"

// A link to a whole page several of the map's sites share, for a dive at
// none of them in particular. Not the bare slug: six such pages have a site
// by that id.
export const mapPagePrefix = "page:"

// The id of a dive site on Explore's map (its page and section, such as
// `whittle-rock/west-pinnacle`), or of a page (`page:castor-rock`), which
// holds across the map's refreshes.
export const mapSiteId = z
  .string()
  .max(120)
  .regex(
    /^(page:[a-z0-9]+(-[a-z0-9]+)*|[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)?)$/,
    "Expected a dive site or page id from Explore's map"
  )

export const entityKinds = [
  "site",
  "region",
  "person",
  "diveCentre",
  "trip",
] as const
export type EntityKind = (typeof entityKinds)[number]

// The order a draft's or a form's new entities are created in: regions
// first, as a new site or dive centre may sit in one.
export const entityCreateOrder: readonly EntityKind[] = [
  "region",
  "site",
  "diveCentre",
  "person",
  "trip",
]

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
      mapSite: mapSiteId,
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
