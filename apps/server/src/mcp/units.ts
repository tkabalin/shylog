// The map's sites come from a ?raw import, declared here as in sites.ts.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../map.d.ts" />
import {
  bodiesOfWater,
  countryCodes,
  currents,
  cylinderMaterials,
  diveTypes,
  entries,
  keysOf,
  litresToMillilitres,
  minutesToSeconds,
  percentToTenths,
  surfaces,
  surges,
  tags,
  thermalComforts,
  visibilityRatings,
  weathers,
  workloads,
  type DiveFields,
} from "@shylog/core"
import { z } from "zod"

import { mapLink } from "../../../web/src/map/sites.ts"
import { Rejected } from "../apply/rejected.ts"

// The tools speak the app's units with the unit in each name, as core's
// database units under bare names would pass validation silently when
// wrong (47 minutes sent as 47 seconds).

// The option keys with their labels, so "moderate current" maps to a key.
const options = <O extends Record<string, { label: string }>>(
  values: O,
  what: string
) =>
  z.enum(keysOf(values)).describe(
    `${what}: ${keysOf(values)
      .map((key) => `${key} (${values[key].label})`)
      .join(", ")}`
  )

const id = (what: string) =>
  z.strictObject({
    id: z.string().describe(`An existing ${what}'s id, from list_entities`),
  })
const named = (what: string) =>
  z.string().min(1).describe(`The new ${what}'s name`)

export const countryCode = z
  .enum(countryCodes)
  .describe("ISO 3166 country code, such as ZA")

// The app links a site only to a site or page its map has, so Claude does
// too.
export const mapSite = z
  .string()
  .refine(
    (id) => mapLink(id) !== undefined,
    "No dive site or page on Explore's map has that id. Find it with search_map_sites."
  )
  .describe(
    "The id of the dive site on Explore's map this site is, from search_map_sites, or a row's pageId (page:<slug>) where the dive was on a page several sites share but at none of them in particular"
  )

// An existing entity by id, or a new one, which is first matched by name to
// one that exists, as the app's drafts are.
export const refs = {
  site: z.union([
    id("site"),
    z.strictObject({
      new: z.strictObject({
        name: named("site"),
        countryCode,
        bodyOfWater: options(bodiesOfWater, "Body of water").optional(),
        mapSite: mapSite.optional(),
        region: z
          .union([
            id("region"),
            z.strictObject({ new: z.strictObject({ name: named("region") }) }),
          ])
          .optional()
          .describe("The site's region, in the site's country"),
      }),
    }),
  ]),
  person: z.union([
    id("person"),
    z.strictObject({ new: z.strictObject({ name: named("person") }) }),
  ]),
  diveCentre: z.union([
    id("dive centre"),
    z.strictObject({
      new: z.strictObject({
        name: named("dive centre"),
        region: id("region").optional(),
      }),
    }),
  ]),
  trip: z.union([
    id("trip"),
    z.strictObject({ new: z.strictObject({ name: named("trip") }) }),
  ]),
}
export type SiteRef = z.output<typeof refs.site>
export type PersonRef = z.output<typeof refs.person>
export type CentreRef = z.output<typeof refs.diveCentre>
export type TripRef = z.output<typeof refs.trip>

const number = (description: string) => z.number().describe(description)
const text = (description: string) => z.string().describe(description)

// Fields every dive has.
const required = {
  startTime: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/,
      "Expected YYYY-MM-DDTHH:mm"
    )
    .describe(
      "Local wall-clock time at the site, YYYY-MM-DDTHH:mm, with no zone"
    ),
  site: refs.site,
  durationMin: number("Minutes, decimals allowed"),
  maxDepthM: number("Metres"),
}

// Fields a dive always has once saved, which can change but not be cleared.
const defaulted = {
  diveType: options(diveTypes, "Dive type"),
  oxygenPercent: z
    .union([z.number(), z.literal("air")])
    .describe(
      'The gas: "air" (or 21 or less), or nitrox from 21.1 to 100 % oxygen'
    ),
  ignored: z
    .boolean()
    .describe("Ignored dives have no number and stay out of totals"),
}

// Fields that can be empty, cleared with null in an edit.
const optional = {
  averageDepthM: number("Metres"),
  trainingAgency: text("Only on a training dive"),
  trainingCourse: text("Only on a training dive"),
  tags: z.array(options(tags, "Tag")),
  trip: refs.trip,
  diveCentre: refs.diveCentre,
  buddies: z.array(refs.person),
  professionals: z
    .array(refs.person)
    .describe("Dive professionals, such as the guide or instructor"),
  entry: options(entries, "Entry"),
  current: options(currents, "Current"),
  surge: options(surges, "Surge"),
  surface: options(surfaces, "Surface"),
  weather: options(weathers, "Weather"),
  minTemperatureC: number("Water, °C"),
  maxTemperatureC: number("Water, °C"),
  visibilityM: number("Metres; or give visibilityRating instead"),
  visibilityRating: options(visibilityRatings, "Visibility"),
  workload: options(workloads, "Workload"),
  thermalComfort: options(thermalComforts, "Thermal comfort"),
  surfaceIntervalMin: z
    .union([z.number(), z.literal("none")])
    .describe(
      'Overrides the calculated interval, in minutes; "none" is no previous dive'
    ),
  weightKg: number("Kilograms"),
  cylinderMaterial: options(cylinderMaterials, "Cylinder"),
  cylinderVolumeL: number("Litres"),
  startPressureBar: number("Bar"),
  endPressureBar: number("Bar"),
  notableAnimals: text("Notable animals"),
  gearDetails: text("Gear details"),
  notes: text("Notes"),
}

const clearable = <S extends Record<string, z.ZodType>>(shape: S) =>
  Object.fromEntries(
    Object.entries(shape).map(([field, schema]) => [
      field,
      schema.nullable().optional(),
    ])
  ) as { [K in keyof S]: z.ZodOptional<z.ZodNullable<S[K]>> }

export const newDiveInput = z.strictObject({
  ...required,
  ...z.strictObject({ ...defaulted, ...optional }).partial().shape,
  // The log's new-dive defaults fill these when left out; null leaves one
  // empty, as clearing it on the form does.
  ...clearable({
    cylinderMaterial: optional.cylinderMaterial,
    cylinderVolumeL: optional.cylinderVolumeL,
    weightKg: optional.weightKg,
  }),
})
export type NewDiveInput = z.output<typeof newDiveInput>

export const diveChangesInput = z.strictObject({
  ...z.strictObject({ ...required, ...defaulted }).partial().shape,
  ...clearable(optional),
})
export type DiveChangesInput = z.output<typeof diveChangesInput>

// Fields whose value is the same in both units, only renamed.
const renamed = {
  maxDepthM: "maxDepth",
  averageDepthM: "averageDepth",
  minTemperatureC: "minTemperature",
  maxTemperatureC: "maxTemperature",
  visibilityM: "visibility",
  weightKg: "weight",
  startPressureBar: "startPressure",
  endPressureBar: "endPressure",
} as const
const same = [
  "diveType",
  "ignored",
  "trainingAgency",
  "trainingCourse",
  "tags",
  "entry",
  "current",
  "surge",
  "surface",
  "weather",
  "visibilityRating",
  "workload",
  "thermalComfort",
  "cylinderMaterial",
  "notableAnimals",
  "gearDetails",
  "notes",
] as const

type Stored = Partial<Record<keyof DiveFields, unknown>>

// The gas as two stored fields. Core keeps oxygen only on a nitrox dive and
// would drop it silently, so a figure that is neither air nor nitrox, such
// as a slipped sign, is refused here, in per cent, as the form says it.
function gas(oxygen: number | "air"): Stored {
  if (oxygen === "air" || (oxygen >= 20 && oxygen <= 21)) {
    return { nitrox: false }
  }
  if (oxygen < 21.1 || oxygen > 100) {
    throw new Rejected(
      'Oxygen is from 21.1 to 100 % for nitrox, or "air" (20 to 21 %)',
      422,
      ["oxygenPercent"]
    )
  }
  return { nitrox: true, oxygen: percentToTenths(oxygen) }
}

// The non-entity fields in database units; undefined stays out, so an edit
// sends only what changed, and null clears.
export function storedFields(input: DiveChangesInput): Stored {
  const out: Stored = {}
  const put = (field: keyof DiveFields, value: unknown) => {
    if (value !== undefined) out[field] = value
  }
  if (input.startTime !== undefined) {
    put(
      "startTime",
      input.startTime.length === 16 ? `${input.startTime}:00` : input.startTime
    )
  }
  if (input.durationMin !== undefined) {
    put("duration", minutesToSeconds(input.durationMin))
  }
  const interval = input.surfaceIntervalMin
  if (interval !== undefined) {
    put(
      "surfaceInterval",
      interval === null || interval === "none"
        ? interval
        : minutesToSeconds(interval)
    )
  }
  const volume = input.cylinderVolumeL
  if (volume !== undefined) {
    put("cylinderVolume", volume === null ? null : litresToMillilitres(volume))
  }
  if (input.oxygenPercent !== undefined) {
    Object.assign(out, gas(input.oxygenPercent))
  }
  for (const [param, field] of Object.entries(renamed)) {
    put(field, input[param as keyof typeof renamed])
  }
  for (const field of same) put(field, input[field])
  return out
}
