import { z } from "zod"

import {
  currents,
  cylinderMaterials,
  diveTypes,
  entries,
  surfaces,
  surges,
  thermalComforts,
  visibilityRatings,
  weathers,
  workloads,
} from "../enums.ts"
import { idSchema } from "../ids.ts"
import { tags } from "../tags.ts"
import {
  choice,
  localDateTime,
  patchShape,
  text,
  uniqueList,
} from "./common.ts"

// Fields in database units: metres, seconds, °C, bar, millilitres, and
// oxygen in tenths of a per cent. Calculated values (number, SAC, MOD, max
// PO₂, CNS, OTU) are derived by the server and never sent.
const required = {
  startTime: localDateTime,
  siteId: idSchema("site"),
  duration: z.int().positive(),
  maxDepth: z.number().positive(),
}

// Always set on a saved dive, so an edit can change them but not clear them.
export const defaultedDiveFields = {
  diveType: choice(diveTypes),
  nitrox: z.boolean(),
  // Set by hand only: an ignored dive has no number and stays out of totals
  // and statistics, but still counts for surface intervals and CNS.
  ignored: z.boolean(),
}

export const optionalDiveFields = {
  trainingAgency: text,
  trainingCourse: text,
  tags: uniqueList(choice(tags)),
  tripId: idSchema("trip"),
  buddies: uniqueList(idSchema("person")),
  diveProfessionals: uniqueList(idSchema("person")),
  diveCentreId: idSchema("diveCentre"),
  entry: choice(entries),
  current: choice(currents),
  surge: choice(surges),
  surface: choice(surfaces),
  weather: choice(weathers),
  minTemperature: z.number(),
  maxTemperature: z.number(),
  visibility: z.number().nonnegative(),
  visibilityRating: choice(visibilityRatings),
  workload: choice(workloads),
  thermalComfort: choice(thermalComforts),
  averageDepth: z.number().positive(),
  // Set only to override the calculated interval; "none" is no previous dive,
  // exported as UDDF's <infinity/>.
  surfaceInterval: z.union([z.int().nonnegative(), z.literal("none")]),
  weight: z.number().nonnegative(),
  cylinderMaterial: choice(cylinderMaterials),
  cylinderVolume: z.int().positive(),
  // Tenths of a per cent. 21 % or less is air, entered as Nitrox no, as an
  // import reads it.
  oxygen: z.int().min(211).max(1000),
  startPressure: z.number().nonnegative(),
  endPressure: z.number().nonnegative(),
  notableAnimals: text,
  gearDetails: text,
  notes: text,
}

// The values a dive computer can disagree with, each adopted or dismissed.
export const comparedFields = [
  "startTime",
  "maxDepth",
  "averageDepth",
  "duration",
  "minTemperature",
  "maxTemperature",
] as const
export type ComparedField = (typeof comparedFields)[number]

type Checked = {
  [
    K in
      | "visibility"
      | "visibilityRating"
      | "buddies"
      | "diveProfessionals"
      | "minTemperature"
      | "maxTemperature"
      | "averageDepth"
      | "maxDepth"
  ]?: z.output<(typeof required & typeof optionalDiveFields)[K]> | null
}

function checkDive(fields: Checked, ctx: z.RefinementCtx) {
  if (fields.visibility != null && fields.visibilityRating != null) {
    ctx.addIssue({
      code: "custom",
      message: "Give visibility in metres or as a rating, not both",
      path: ["visibilityRating"],
    })
  }
  const buddies = new Set(fields.buddies)
  if (fields.diveProfessionals?.some((id) => buddies.has(id))) {
    ctx.addIssue({
      code: "custom",
      message: "A person is either a buddy or a dive professional on a dive",
      path: ["diveProfessionals"],
    })
  }
  const { minTemperature, maxTemperature, averageDepth, maxDepth } = fields
  if (
    minTemperature != null &&
    maxTemperature != null &&
    minTemperature > maxTemperature
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Minimum is above maximum",
      path: ["minTemperature"],
    })
  }
  if (averageDepth != null && maxDepth != null && averageDepth > maxDepth) {
    ctx.addIssue({
      code: "custom",
      message: "Deeper than the maximum depth",
      path: ["averageDepth"],
    })
  }
}

// Oxygen is saved only on a nitrox dive, which must have it so every nitrox
// dive has a known gas mix. Deleted rather than set to undefined, so a key
// present is a value sent.
export function nitroxOxygen<
  S extends z.ZodType<{ nitrox?: boolean; oxygen?: number }>,
>(schema: S) {
  return schema
    .refine((fields) => !fields.nitrox || fields.oxygen !== undefined, {
      message: "Give the oxygen percentage for nitrox",
      path: ["oxygen"],
    })
    .transform((fields) => {
      if (!fields.nitrox) delete fields.oxygen
      return fields
    })
}

// Training details are kept while the form is open but saved only on a
// Training dive.
export const diveFieldsSchema = nitroxOxygen(
  z
    .strictObject({
      ...required,
      ...z.object(optionalDiveFields).partial().shape,
      diveType: defaultedDiveFields.diveType.default("recreation"),
      nitrox: defaultedDiveFields.nitrox.default(false),
      ignored: defaultedDiveFields.ignored.default(false),
    })
    .superRefine(checkDive)
).transform((fields) => {
  if (fields.diveType !== "training") {
    delete fields.trainingAgency
    delete fields.trainingCourse
  }
  return fields
})
export type DiveFields = z.output<typeof diveFieldsSchema>

// Rules that span fields apply when the patch holds both. The server checks
// the rest against the saved dive, and clears stored training details or
// oxygen when the dive stops being Training or nitrox (see docs/PLAN.md).
export const diveFieldsPatch = z
  .strictObject(
    patchShape({ ...required, ...defaultedDiveFields }, optionalDiveFields)
  )
  .superRefine(checkDive)
  .refine((fields) => fields.nitrox !== true || fields.oxygen !== null, {
    message: "Give the oxygen percentage for nitrox",
    path: ["oxygen"],
  })
  // As on a new dive, values that no longer apply are dropped, not saved.
  .transform((fields) => {
    if (fields.diveType !== undefined && fields.diveType !== "training") {
      delete fields.trainingAgency
      delete fields.trainingCourse
    }
    if (fields.nitrox === false) delete fields.oxygen
    return fields
  })
export type DiveFieldsPatch = z.output<typeof diveFieldsPatch>

// The most dives one `GET /api/samples` asks for (see Client data).
export const samplesBatch = 25
export const sampleIdsSchema = z
  .array(idSchema("dive"))
  .min(1)
  .max(samplesBatch)
