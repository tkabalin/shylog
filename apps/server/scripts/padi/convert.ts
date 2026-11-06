import {
  countryCodes,
  diveFieldsPatch,
  litresToMillilitres,
  minutesToSeconds,
  normaliseName,
  percentToTenths,
  placeKey,
  type BodyOfWater,
  type WaterType,
} from "@shylog/core"
import { z } from "zod"

import * as codes from "./codes.ts"

// Reads the PADI app's logbook, as the PADI Logbook Exporter browser
// extension saves it (JSON), for a one-off merge onto dives the dive
// computer's import already brought in. PADI's values were typed by hand.

const text = z.string().nullable()
const figure = z.number().nullable()
const padiDive = z.object({
  id: z.number(),
  log_type: z.string(),
  dive_type: text,
  dive_date: z.string().regex(/^\d{4}-\d\d-\d\d/),
  dive_location: text,
  depth_times: z.array(z.object({ max_depth: figure, bottom_time: figure })),
  conditions: z.array(
    z.object({
      water_type: text,
      body_of_water: text,
      weather: text,
      surface_water_temp: figure,
      bottom_water_temp: figure,
      visibility: text,
      visibility_distance: figure,
      wave_condition: text,
      current: text,
      surge: text,
    })
  ),
  equipment: z.array(
    z.object({
      suit_type: text,
      additional_equipment: z.array(z.string()).nullable(),
      weight: figure,
      cylinder_type: text,
      cylinder_size: figure,
      oxygen: figure,
      starting_pressure: figure,
      ending_pressure: figure,
    })
  ),
  experiences: z.array(
    z.object({ feeling: text, notes: text, buddies: text, dive_center: text })
  ),
})
// The extension writes null for a dive whose details it failed to fetch.
const exportSchema = z.object({ dives: z.array(padiDive.nullable()) })

const name = z.string().trim().min(1)

// What the export doesn't say, kept beside it rather than in this public
// repo. `sites`, `people` and `centres` are keyed by what PADI holds,
// matched ignoring case and spacing; `dives` by PADI's dive id.
export const extrasSchema = z.strictObject({
  sites: z.record(
    z.string(),
    z.strictObject({
      name,
      country: z
        .string()
        .refine((code) => (countryCodes as readonly string[]).includes(code)),
      region: name.optional(),
    })
  ),
  // null leaves a name out, such as a club typed in as a buddy.
  people: z.record(z.string(), name.nullable()).default({}),
  centres: z.record(z.string(), name.nullable()).default({}),
  dives: z
    .record(
      z.string(),
      z.strictObject({
        // A dive PADI holds twice.
        skip: z.literal(true).optional(),
        // The day the dive was, when the diver saved it in PADI on another.
        date: z
          .string()
          .regex(/^\d{4}-\d\d-\d\d$/)
          .optional(),
        // For a dive no dive computer recorded, "09:30".
        startTime: z
          .string()
          .regex(/^\d\d:\d\d$/)
          .optional(),
        // Shylog names, moved from the buddies if PADI lists them there.
        professionals: z.array(name).default([]),
        // Shylog names in place of PADI's, such as names typed into the notes.
        buddies: z.array(name).optional(),
        diveCentre: name.optional(),
        notes: z.string().optional(),
      })
    )
    .default({}),
})
export type Extras = z.input<typeof extrasSchema>

export interface PadiSite {
  name: string
  countryCode: string
  region: string | null
  bodyOfWater: BodyOfWater | null
  waterType: WaterType | null
}

export interface PadiDive {
  padiId: number
  label: string
  date: string
  // From the extras, for a dive no computer recorded.
  startTime: string | null
  duration: number
  maxDepth: number
  // A key of `sites`.
  site: string
  buddies: string[]
  professionals: string[]
  centre: string | null
  // Values to fill on the matched dive.
  fields: Record<string, string | number>
  // What the dive computer would otherwise give, for a dive it didn't record.
  computerFields: Record<string, number | boolean>
}

const keyed = <T>(record: Record<string, T>) =>
  new Map(
    Object.entries(record).map(([key, value]) => [normaliseName(key), value])
  )

export function convertPadi(
  json: unknown,
  extrasInput: Extras
): { dives: PadiDive[]; sites: Map<string, PadiSite>; skipped: number } {
  const extras = extrasSchema.parse(extrasInput)
  const exported = exportSchema.parse(json)
  const problems: string[] = []
  const placesByName = keyed(extras.sites)
  const peopleByName = keyed(extras.people)
  const centresByName = keyed(extras.centres)
  const unusedOverrides = new Set(Object.keys(extras.dives))
  const sites = new Map<string, PadiSite>()

  if (exported.dives.includes(null))
    problems.push(
      `${exported.dives.filter((dive) => !dive).length} dives came without their details: export again`
    )

  const dives = exported.dives.flatMap((padi) => {
    if (!padi) return []
    const extra = extras.dives[String(padi.id)]
    const date = extra?.date ?? padi.dive_date.slice(0, 10)
    const location = padi.dive_location?.trim() ?? ""
    const label = `PADI dive ${padi.id} (${date}, ${location || "no site"})`
    unusedOverrides.delete(String(padi.id))
    if (extra?.skip) return []

    function lookup<T>(
      what: string,
      value: string | null,
      table: Record<string, T>
    ) {
      if (!value) return null
      if (!(value in table)) {
        problems.push(`${label}: unknown ${what} ${value}`)
        return null
      }
      return table[value]!
    }
    // PADI keeps each part of a dive as a list of one.
    const depth = padi.depth_times[0]
    const conditions = padi.conditions[0]
    const equipment = padi.equipment[0]
    const experience = padi.experiences[0]

    const place = placesByName.get(normaliseName(location))
    if (!place)
      problems.push(`${label}: the extras file has no site for "${location}"`)
    const siteKey = place ? placeKey(place.name, place.country) : ""
    const bodyOfWater = lookup(
      "body of water",
      conditions?.body_of_water ?? null,
      codes.bodiesOfWater
    )
    const waterType = lookup(
      "water type",
      conditions?.water_type ?? null,
      codes.waterTypes
    )
    if (place) {
      // PADI logs the water per dive; Shylog keeps it on the site.
      const site = sites.get(siteKey) ?? {
        name: place.name,
        countryCode: place.country,
        region: place.region ?? null,
        bodyOfWater: null,
        waterType: null,
      }
      if (
        (bodyOfWater && site.bodyOfWater && site.bodyOfWater !== bodyOfWater) ||
        (waterType && site.waterType && site.waterType !== waterType)
      )
        problems.push(`${label}: ${place.name}'s water differs between dives`)
      site.bodyOfWater = bodyOfWater ?? site.bodyOfWater
      site.waterType = waterType ?? site.waterType
      sites.set(siteKey, site)
    }

    // "Sam, Alex and Jo".
    const professionals = extra?.professionals ?? []
    const buddies = (
      extra?.buddies ??
      (experience?.buddies ?? "")
        .split(/\s*(?:,|&|\band\b)\s*/i)
        .map((token) => token.trim())
        .filter(Boolean)
        .flatMap((token) => {
          const person = peopleByName.get(normaliseName(token))
          if (person === undefined) {
            problems.push(
              `${label}: the extras file has no person for "${token}"`
            )
            return []
          }
          return person == null ? [] : [person]
        })
    ).filter(
      (person) =>
        !professionals.some(
          (pro) => normaliseName(pro) === normaliseName(person)
        )
    )

    let centre = extra?.diveCentre ?? null
    const padiCentre = experience?.dive_center?.trim()
    if (!centre && padiCentre) {
      const named = centresByName.get(normaliseName(padiCentre))
      if (named === undefined)
        problems.push(
          `${label}: the extras file has no dive centre for "${padiCentre}"`
        )
      centre = named ?? null
    }

    const maxDepth = depth?.max_depth ?? null
    const minutes = depth?.bottom_time ?? null
    if (!maxDepth) problems.push(`${label}: no max depth`)
    if (!minutes) problems.push(`${label}: no bottom time`)

    const suit = lookup("suit", equipment?.suit_type ?? null, codes.suits)
    const extrasOrder = Object.keys(codes.extraGear)
    const gear = (equipment?.additional_equipment ?? [])
      .toSorted((a, b) => extrasOrder.indexOf(a) - extrasOrder.indexOf(b))
      .map((item) => lookup("piece of gear", item, codes.extraGear))
    const feeling = experience?.feeling?.trim()
    const notes = [
      extra?.notes ?? experience?.notes?.trim(),
      feeling && `Felt ${feeling.toLowerCase()}.`,
    ].filter(Boolean)
    const litres = equipment?.cylinder_size ?? null
    // A distance is the better record; Shylog takes one or the other.
    const metres = conditions?.visibility_distance || null

    const fields = Object.fromEntries(
      Object.entries({
        diveType: lookup("log type", padi.log_type, codes.diveTypes),
        entry: lookup("dive type", padi.dive_type, codes.entries),
        current: lookup("current", conditions?.current ?? null, codes.currents),
        surge: lookup("surge", conditions?.surge ?? null, codes.surges),
        surface: lookup(
          "wave condition",
          conditions?.wave_condition ?? null,
          codes.surfaces
        ),
        weather: lookup("weather", conditions?.weather ?? null, codes.weathers),
        visibility: metres,
        visibilityRating: metres
          ? null
          : lookup(
              "visibility",
              conditions?.visibility ?? null,
              codes.visibilityRatings
            ),
        // A dive without weights logs none rather than 0 kg.
        weight: equipment?.weight || null,
        cylinderMaterial: lookup(
          "cylinder",
          equipment?.cylinder_type ?? null,
          codes.cylinderMaterials
        ),
        cylinderVolume: litres ? litresToMillilitres(litres) : null,
        startPressure: equipment?.starting_pressure ?? null,
        endPressure: equipment?.ending_pressure ?? null,
        gearDetails: [suit, ...gear].filter(Boolean).join(", ") || null,
        notes: notes.join("\n") || null,
      }).filter(([, value]) => value != null)
    ) as Record<string, string | number>

    // Surface and bottom, whichever were logged.
    const temperatures = [
      conditions?.surface_water_temp,
      conditions?.bottom_water_temp,
    ].filter((value) => value != null)
    const oxygen = equipment?.oxygen ?? null
    // 21 % or less is air, as the dive form saves it.
    const nitrox = oxygen != null && oxygen > 21
    const computerFields = {
      ...(temperatures.length && {
        minTemperature: Math.min(...temperatures),
        maxTemperature: Math.max(...temperatures),
      }),
      nitrox,
      ...(nitrox && { oxygen: percentToTenths(oxygen) }),
    }

    const checked = diveFieldsPatch.safeParse({
      ...fields,
      ...computerFields,
      ...(maxDepth && { maxDepth }),
    })
    if (!checked.success)
      problems.push(
        `${label}: ${checked.error.issues.map((issue) => `${issue.path.join(" ")}: ${issue.message}`).join("; ")}`
      )

    return [
      {
        padiId: padi.id,
        label,
        date,
        startTime: extra?.startTime ? `${date}T${extra.startTime}:00` : null,
        duration: minutes ? minutesToSeconds(minutes) : 0,
        maxDepth: maxDepth ?? 0,
        site: siteKey,
        buddies: [...new Set(buddies)],
        professionals,
        centre,
        fields,
        computerFields,
      },
    ]
  })

  // The PADI app can save a dive twice; one copy is skipped in the extras.
  const seen = new Map<string, PadiDive>()
  for (const dive of dives) {
    const key = JSON.stringify([
      dive.date,
      dive.maxDepth,
      dive.duration,
      dive.site,
      dive.fields,
    ])
    const twin = seen.get(key)
    if (twin)
      problems.push(
        `${dive.label} repeats PADI dive ${twin.padiId}: skip one in the extras`
      )
    seen.set(key, dive)
  }
  for (const id of unusedOverrides)
    problems.push(
      `The extras file names PADI dive ${id}, which isn't in the export`
    )
  if (problems.length) throw new Error(problems.join("\n"))

  return { dives, sites, skipped: exported.dives.length - dives.length }
}
