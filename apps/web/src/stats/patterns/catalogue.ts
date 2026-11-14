import {
  currents,
  cylinderMaterials,
  entries,
  surfaces,
  surges,
  tags as allTags,
  thermalComforts,
  toMillimetres,
  weathers,
  workloads,
} from "@shylog/core"

import type { Dive } from "@/data/db"
import { isUnknown } from "@/data/entities"
import type { DiveLinks, LogView } from "@/data/log"
import { diveSac } from "@/dive/figures"

import { fullMonths } from "../charts/parts"
import { depthBands, timesOfDay, visibilityLevel } from "../figures"

// One counted dive with what the rules read from it, worked out once.
export interface Row {
  dive: Dive
  sac: number | null
  // Tenths of a degree, so bands and cut-offs never compare floats.
  temperature: number | null
  visibility: string | null
  regionId: string | null
  links: DiveLinks
}

const noLinks: DiveLinks = { buddies: [], professionals: [], tags: [] }

// Oldest first, as Statistics counts them, so ties go to the earlier dive.
export function rowsOf(dives: readonly Dive[], log: LogView): Row[] {
  return dives.map((dive) => {
    const sac = diveSac(dive, log)
    return {
      dive,
      // As Averages takes it: rates of 0.1 L/min or less are bogus.
      sac: sac != null && sac > 0.1 ? sac : null,
      temperature:
        dive.minTemperature == null
          ? null
          : Math.round(dive.minTemperature * 10),
      visibility: visibilityLevel(dive),
      regionId: log.sites.get(dive.siteId)?.regionId ?? null,
      links: log.links.get(dive.id) ?? noLinks,
    }
  })
}

// A level at or past the given one, null when the field isn't logged.
const atLeast = <T extends string>(
  levels: Record<T, unknown>,
  from: T,
  value: T | null | undefined
) => {
  if (value == null) return null
  const keys = Object.keys(levels)
  return keys.indexOf(value) >= keys.indexOf(from) ? 1 : 0
}

export interface Measure {
  key: string
  // The measure it is listed under in All patterns and counted as in the
  // top three: the two visibility outcomes are both Visibility.
  group: string
  value: (row: Row) => number | null
  // The smallest difference that counts, in the measure's own units; a
  // share is 0 or 1 per dive, so 0.2 is 20 percentage points.
  minimum: number
  // A share of the lower group's average the difference must reach too.
  relative?: number
  share?: true
  // What each dive counts for in an average: SAC rate is weighted by the
  // dive's duration, as Statistics' own average is, so the two agree.
  weight?: (row: Row) => number
}

export const measures = {
  sac: {
    key: "sac",
    group: "sac",
    value: (r) => r.sac,
    minimum: 1.5,
    relative: 0.1,
    weight: (r) => r.dive.duration,
  },
  maxDepth: {
    key: "maxDepth",
    group: "maxDepth",
    value: (r) => r.dive.maxDepth,
    minimum: 3,
  },
  // In seconds, as dives store it.
  duration: {
    key: "duration",
    group: "duration",
    value: (r) => r.dive.duration,
    minimum: 300,
  },
  // Only dives with a computer profile: a hand-logged dive can't have had
  // an alarm, and counting it as none would pull the average down.
  ascentAlarms: {
    key: "ascentAlarms",
    group: "ascentAlarms",
    value: (r) => (r.dive.sparkline ? r.dive.ascentAlarmCount : null),
    minimum: 0.5,
  },
  waterTemperature: {
    key: "waterTemperature",
    group: "waterTemperature",
    value: (r) => (r.temperature == null ? null : r.temperature / 10),
    minimum: 2,
  },
  cold: {
    key: "cold",
    group: "thermalComfort",
    value: (r) =>
      r.dive.thermalComfort == null
        ? null
        : r.dive.thermalComfort === "cold" ||
            r.dive.thermalComfort === "veryCold"
          ? 1
          : 0,
    minimum: 0.2,
    share: true,
  },
  lowVisibility: {
    key: "lowVisibility",
    group: "visibility",
    value: (r) =>
      r.visibility == null ? null : r.visibility === "low" ? 1 : 0,
    minimum: 0.2,
    share: true,
  },
  highVisibility: {
    key: "highVisibility",
    group: "visibility",
    value: (r) =>
      r.visibility == null ? null : r.visibility === "high" ? 1 : 0,
    minimum: 0.2,
    share: true,
  },
  strongCurrent: {
    key: "strongCurrent",
    group: "current",
    value: (r) => atLeast(currents, "moderate", r.dive.current),
    minimum: 0.2,
    share: true,
  },
  strongSurge: {
    key: "strongSurge",
    group: "surge",
    value: (r) => atLeast(surges, "moderate", r.dive.surge),
    minimum: 0.2,
    share: true,
  },
  hardWorkload: {
    key: "hardWorkload",
    group: "workload",
    value: (r) => atLeast(workloads, "moderate", r.dive.workload),
    minimum: 0.2,
    share: true,
  },
  nitrox: {
    key: "nitrox",
    group: "gas",
    value: (r) => (r.dive.nitrox ? 1 : 0),
    minimum: 0.2,
    share: true,
  },
} satisfies Record<string, Measure>

export type MeasureKey = keyof typeof measures

// A group as a sentence names it ("in moderate or stronger current") and
// as its row in the detail does ("Moderate or stronger").
export interface Named {
  label: string
  phrase: string
  // The dives themselves, where the group is a kind of dive: a share reads
  // "70% of dry suit dives", not "70% of dives on dry suit dives".
  dives?: string
  // A trip's dives are behind you, even mid-trip, so its sentence reads
  // "You dived" rather than "You dive".
  past?: boolean
}

// Levels with an order split at a boundary into those below and above it.
export interface OrderedField {
  key: string
  kind: "ordered"
  value: (row: Row) => string | null
  // The field's levels in order; a split names its two sides from the
  // levels the dives have.
  order: (keys: string[]) => string[]
  names: (lower: string[], upper: string[]) => [Named, Named]
}

// One value against all the others.
export interface SingleField {
  key: string
  kind: "single"
  value: (row: Row) => string | null
  order: (keys: string[]) => string[]
  names: (key: string) => [Named, Named]
}

// The dives with one person, centre, trip or tag against those without.
export interface ManyField {
  key: string
  kind: "many"
  value: (row: Row) => string[]
  order: (keys: string[]) => string[]
  names: (key: string) => [Named, Named]
}

export type Field = OrderedField | SingleField | ManyField

const capital = (text: string) => text[0]!.toUpperCase() + text.slice(1)
const named = (name: string, phrase: string): Named => ({
  label: capital(name),
  phrase,
})

// "None to mild", "very cold or cold", "moderate or stronger".
function choiceNames(
  options: Record<string, { label: string }>,
  up: string,
  phrase: (name: string) => string
) {
  const label = (key: string) => options[key]!.label.toLowerCase()
  return (lower: string[], upper: string[]): [Named, Named] => {
    const below =
      lower.length === 1
        ? label(lower[0]!)
        : lower.length === 2
          ? `${label(lower[0]!)} or ${label(lower[1]!)}`
          : `${label(lower[0]!)} to ${label(lower.at(-1)!)}`
    const above =
      upper.length === 1 ? label(upper[0]!) : `${label(upper[0]!)} or ${up}`
    return [named(below, phrase(below)), named(above, phrase(above))]
  }
}

const inOrder = (options: Record<string, unknown>) => (keys: string[]) =>
  Object.keys(options).filter((key) => keys.includes(key))

const choice = (
  key: string,
  options: Record<string, { label: string }>,
  value: (dive: Dive) => string | null | undefined,
  up: string,
  phrase: (name: string) => string
): OrderedField => ({
  key,
  kind: "ordered",
  value: (row) => value(row.dive) ?? null,
  order: inOrder(options),
  names: choiceNames(options, up, phrase),
})

// "In no current" reads better than "in none current".
const strength = (noun: string) => (name: string) =>
  name === "none" ? `in no ${noun}` : `in ${name} ${noun}`

// Cold to hot, as Statistics draws it, rather than the form's order.
const thermalOrder = {
  veryCold: thermalComforts.veryCold,
  cold: thermalComforts.cold,
  comfortable: thermalComforts.comfortable,
  hot: thermalComforts.hot,
}

// Bands named at their boundary: "shallower than 18 m", "18 m or deeper".
function bands(
  key: string,
  count: number,
  band: (row: Row) => number | null,
  below: (i: number) => string,
  above: (i: number) => string,
  phrase: (name: string) => string
): OrderedField {
  const keys = Array.from({ length: count }, (_, i) => String(i))
  return {
    key,
    kind: "ordered",
    value: (row) => {
      const i = band(row)
      return i == null ? null : String(i)
    },
    order: (present) => keys.filter((k) => present.includes(k)),
    names: (lower, upper) => {
      // The lower side ends at its last band's top; the upper side starts
      // at its first band's bottom, so a band no dive is in isn't claimed.
      const a = below(Number(lower.at(-1)))
      const b = above(Number(upper[0]))
      return [named(a, phrase(a)), named(b, phrase(b))]
    },
  }
}

const bandOf = (bounds: readonly number[], value: number) => {
  const i = bounds.findIndex((bound) => value < bound)
  return i < 0 ? bounds.length : i
}

const depthBounds = depthBands.slice(0, -1).map((band) => band.below)
const hourBounds = timesOfDay.slice(0, -1).map((part) => part.below)

const byName = (name: (key: string) => string) => (keys: string[]) =>
  [...keys].sort((a, b) =>
    name(a).localeCompare(name(b), "en-GB", { numeric: true })
  )

const tagField = (tag: keyof typeof allTags, noun: string): ManyField => ({
  key: `tag:${tag}`,
  kind: "many",
  value: (row) => (row.links.tags.includes(tag) ? [tag] : []),
  order: (keys) => keys,
  names: () => [
    { ...named(`${noun} dives`, `on ${noun} dives`), dives: `${noun} dives` },
    { label: "Other dives", phrase: "on other dives", dives: "other dives" },
  ],
})

const litres = (ml: number) => `${Math.round(ml / 100) / 10} L`

// A weighted average over the dives with the measure, or null for none.
export function average(measure: Measure, rows: readonly Row[]) {
  let sum = 0
  let weights = 0
  for (const row of rows) {
    const value = measure.value(row)
    if (value == null) continue
    const weight = measure.weight?.(row) ?? 1
    sum += value * weight
    weights += weight
  }
  return weights ? sum / weights : null
}

// Every field the catalogue compares, with the log to name its values.
export function fieldsOf(log: LogView) {
  const siteName = (id: string) => log.sites.get(id)?.name ?? ""
  const regionName = (id: string) => log.regions.get(id)?.name ?? ""
  const personName = (id: string) => log.people.get(id)?.name ?? ""
  const centreName = (id: string) => log.diveCentres.get(id)?.name ?? ""
  const tripName = (id: string) => log.trips.get(id)?.name ?? ""
  const person = (key: string, list: (links: DiveLinks) => string[]) =>
    ({
      key,
      kind: "many",
      value: (row) => list(row.links),
      order: byName(personName),
      names: (id) => {
        const name = personName(id)
        return [
          { label: `With ${name}`, phrase: `with ${name}` },
          { label: `Without ${name}`, phrase: `without ${name}` },
        ]
      },
    }) satisfies ManyField

  return {
    current: choice(
      "current",
      currents,
      (d) => d.current,
      "stronger",
      strength("current")
    ),
    surge: choice(
      "surge",
      surges,
      (d) => d.surge,
      "stronger",
      strength("surge")
    ),
    workload: choice(
      "workload",
      workloads,
      (d) => d.workload,
      "harder",
      (name) => `at ${name} workload`
    ),
    thermalComfort: choice(
      "thermalComfort",
      thermalOrder,
      (d) => d.thermalComfort,
      "warmer",
      (name) => `when you felt ${name}`
    ),
    weather: choice(
      "weather",
      weathers,
      (d) => d.weather,
      "worse",
      (name) => `in ${name} weather`
    ),
    surface: choice(
      "surface",
      surfaces,
      (d) => d.surface,
      "rougher",
      (name) => `on a ${name} surface`
    ),
    depthBand: bands(
      "depthBand",
      depthBands.length,
      (row) => bandOf(depthBounds, toMillimetres(row.dive.maxDepth)),
      (i) => `shallower than ${depthBands[i]!.below / 1000} m`,
      (i) => `${depthBounds[i - 1]! / 1000} m or deeper`,
      // "Your dives are 13 min shorter when you go 30 m or deeper", where
      // "on dives 30 m or deeper" said dives twice.
      (name) =>
        name.startsWith("shallower")
          ? `when you stay ${name}`
          : `when you go ${name}`
    ),
    // Under 16 °C, 16 to 20 °C and over 20 °C, in tenths.
    waterTemperatureBand: bands(
      "waterTemperatureBand",
      3,
      (row) =>
        row.temperature == null
          ? null
          : row.temperature < 160
            ? 0
            : row.temperature <= 200
              ? 1
              : 2,
      (i) => (i === 0 ? "under 16 °C" : "20 °C or colder"),
      (i) => (i === 1 ? "16 °C or warmer" : "over 20 °C"),
      (name) => `in water ${name}`
    ),
    timeOfDay: bands(
      "timeOfDay",
      timesOfDay.length,
      (row) => bandOf(hourBounds, Number(row.dive.startTime.slice(11, 13))),
      (i) => `before ${timesOfDay[i]!.below}:00`,
      (i) => `at ${hourBounds[i - 1]}:00 or later`,
      (name) => `when you start ${name}`
    ),
    cylinderVolume: {
      key: "cylinderVolume",
      kind: "ordered",
      value: (row) =>
        row.dive.cylinderVolume == null
          ? null
          : String(row.dive.cylinderVolume),
      order: (keys) => [...keys].sort((a, b) => Number(a) - Number(b)),
      names: (lower, upper) => {
        const a =
          lower.length === 1
            ? litres(Number(lower[0]))
            : `up to ${litres(Number(lower.at(-1)))}`
        const b =
          upper.length === 1
            ? litres(Number(upper[0]))
            : `${litres(Number(upper[0]))} or more`
        return [
          named(a, `with ${a} cylinders`),
          named(b, `with ${b} cylinders`),
        ]
      },
    } satisfies OrderedField,
    entry: {
      key: "entry",
      kind: "single",
      value: (row) => row.dive.entry ?? null,
      order: inOrder(entries),
      names: (key) => {
        const label = entries[key as keyof typeof entries].label
        const dives =
          key === "other"
            ? "dives with another entry"
            : `${label.toLowerCase()} dives`
        return [
          { label, phrase: `on ${dives}`, dives },
          {
            label: "Other entries",
            phrase: "on other entries",
            dives: "dives with other entries",
          },
        ]
      },
    } satisfies SingleField,
    // Nitrox first, so of the two equal splits the sentence is about it.
    gas: {
      key: "gas",
      kind: "single",
      value: (row) => (row.dive.nitrox ? "nitrox" : "air"),
      order: (keys) => ["nitrox", "air"].filter((key) => keys.includes(key)),
      names: (key) => {
        const nitrox = { label: "Nitrox", phrase: "on nitrox" }
        const air = { label: "Air", phrase: "on air" }
        return key === "nitrox" ? [nitrox, air] : [air, nitrox]
      },
    } satisfies SingleField,
    cylinderMaterial: {
      key: "cylinderMaterial",
      kind: "single",
      value: (row) => row.dive.cylinderMaterial ?? null,
      order: inOrder(cylinderMaterials),
      names: (key) => {
        const [one, other] = (
          key === "steel" ? ["steel", "aluminium"] : ["aluminium", "steel"]
        ) as (keyof typeof cylinderMaterials)[]
        const side = (k: typeof one) =>
          named(
            cylinderMaterials[k].label,
            `with ${cylinderMaterials[k].label.toLowerCase()} cylinders`
          )
        return [side(one), side(other!)]
      },
    } satisfies SingleField,
    region: {
      key: "region",
      kind: "single",
      value: (row) => row.regionId,
      order: byName(regionName),
      names: (id) => [
        { label: regionName(id), phrase: `in ${regionName(id)}` },
        { label: "Other regions", phrase: "elsewhere" },
      ],
    } satisfies SingleField,
    site: {
      key: "site",
      kind: "single",
      // The Unknown site is where an import leaves dives, not a place.
      value: (row) =>
        isUnknown(log, row.dive.siteId) ? null : row.dive.siteId,
      order: byName(siteName),
      names: (id) => [
        { label: siteName(id), phrase: `at ${siteName(id)}` },
        { label: "Other sites", phrase: "at other sites" },
      ],
    } satisfies SingleField,
    // Every March, whatever the year.
    month: {
      key: "month",
      kind: "single",
      value: (row) => row.dive.startTime.slice(5, 7),
      order: (keys) => [...keys].sort(),
      names: (key) => {
        const month = fullMonths[Number(key) - 1]!
        return [
          { label: month, phrase: `in ${month}` },
          { label: "Other months", phrase: "in other months" },
        ]
      },
    } satisfies SingleField,
    buddy: person("buddy", (links) => links.buddies),
    professional: person("professional", (links) => links.professionals),
    diveCentre: {
      key: "diveCentre",
      kind: "many",
      value: (row) => (row.dive.diveCentreId ? [row.dive.diveCentreId] : []),
      order: byName(centreName),
      names: (id) => [
        { label: `With ${centreName(id)}`, phrase: `with ${centreName(id)}` },
        {
          label: `Without ${centreName(id)}`,
          phrase: `without ${centreName(id)}`,
        },
      ],
    } satisfies ManyField,
    trip: {
      key: "trip",
      kind: "many",
      value: (row) => (row.dive.tripId ? [row.dive.tripId] : []),
      order: byName(tripName),
      names: (id) => [
        {
          label: `On ${tripName(id)}`,
          phrase: `on ${tripName(id)}`,
          past: true,
        },
        { label: "Other dives", phrase: "on other dives" },
      ],
    } satisfies ManyField,
    drySuit: tagField("drySuit", "dry suit"),
    night: tagField("night", "night"),
    drift: tagField("drift", "drift"),
    photoVideo: tagField("photoVideo", "photo/video"),
  }
}

export type Fields = ReturnType<typeof fieldsOf>
export type FieldKey = keyof Fields

// The spec's catalogue: each measure against each field in its row.
export const differences: [MeasureKey, FieldKey[]][] = [
  [
    "sac",
    [
      "current",
      "surge",
      "workload",
      "thermalComfort",
      "depthBand",
      "gas",
      "cylinderMaterial",
      "cylinderVolume",
      "timeOfDay",
      "entry",
      "region",
      "diveCentre",
      "buddy",
      "drySuit",
      "night",
      "drift",
      "photoVideo",
    ],
  ],
  [
    "maxDepth",
    ["buddy", "professional", "diveCentre", "region", "trip", "gas", "entry"],
  ],
  [
    "duration",
    ["depthBand", "gas", "entry", "region", "current", "waterTemperatureBand"],
  ],
  [
    "ascentAlarms",
    ["depthBand", "current", "surge", "workload", "buddy", "gas", "timeOfDay"],
  ],
  ["cold", ["region", "month", "drySuit"]],
  ["lowVisibility", ["surge", "weather", "surface", "region", "month"]],
  ["highVisibility", ["surge", "weather", "surface", "region", "month"]],
  ["strongCurrent", ["region", "site", "month", "entry"]],
  ["strongSurge", ["region", "site", "month", "entry"]],
  ["hardWorkload", ["current", "surge", "depthBand", "gas"]],
]

export const changes: MeasureKey[] = [
  "sac",
  "maxDepth",
  "duration",
  "ascentAlarms",
  "nitrox",
]
export const trends: MeasureKey[] = [
  "sac",
  "maxDepth",
  "duration",
  "ascentAlarms",
]

export type RuleType =
  | "difference"
  | "threshold"
  | "change"
  | "trend"
  | "habit"
  | "season"
  | "record"

// A row in the detail: "Moderate or stronger", "6 dives", "17.2 L/min".
export interface Group {
  label: string
  detail: string
  value: string
  unit?: string
  // Dives the rule leaves out, shown so the counts add up.
  quiet?: true
}

// The sentence in three parts, the middle one set in bold as StatsHifi
// sets its findings: "Your SAC rate is ", "3.9 L/min higher", " in …".
export type Words = [string, string, string]

export interface Pattern {
  // Stable for a given finding, so ties break the same way every time.
  id: string
  type: RuleType
  // What All patterns lists it under, and what the top three keeps apart.
  measure: string
  field: string
  // Which way a trend goes, for its icon.
  rising?: boolean
  score: number
  words: Words
  groups: Group[]
  // The dives behind it, drawn over its groups where the numbers alone
  // can't show how they spread.
  chart?: Chart
}

export type Chart =
  // A threshold's dives along the water temperature, in tenths, and
  // whether each felt cold.
  | {
      kind: "threshold"
      dives: { tenths: number; hit: boolean }[]
      cuts: [number, number]
    }
  // A difference's or change's groups, each dive's value in the unit shown,
  // with the group's average.
  | {
      kind: "lanes"
      unit: string
      lanes: { values: number[]; average: number }[]
    }
  // A season's region month by month, January first: the average water
  // temperature and how many dives it is from, the two compared marked.
  | {
      kind: "months"
      months: { average: number | null; count: number; marked: boolean }[]
    }
