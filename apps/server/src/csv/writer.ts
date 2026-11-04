import {
  bodiesOfWater,
  countryName,
  currents,
  cylinderMaterials,
  diveOxygen,
  diveSacRate,
  diveTypes,
  entries,
  keysOf,
  maxPo2,
  millilitresToLitres,
  mod,
  secondsToMinutes,
  surfaces,
  surges,
  tags,
  tenthsToPercent,
  thermalComforts,
  visibilityRatings,
  waterTypes,
  weathers,
  workloads,
  type WaterType,
} from "@shylog/core"

import { readSettings } from "../apply/settings.ts"
import { byDive } from "../db/by-dive.ts"
import type { Db } from "../db/open.ts"
import { selectEvents, selectSamples } from "../profile.ts"
import { decimal } from "../uddf/xml.ts"

// The whole log as CSV for spreadsheets (see CSV export in the spec): one
// row per dive in the app's units, names in place of links, labels in
// place of keys. Read in one transaction, like the UDDF export.

type Cell = string | number | null | undefined

// RFC 4180 with CRLF line ends, and a byte order mark, without which Excel
// reads UTF-8 as its own code page and mangles "Simon’s Town".
export function encodeCsv(rows: string[][]) {
  const field = (value: string) =>
    // A semicolon too: Excel in a region that writes decimals with a comma
    // splits on it when it opens the file.
    /[",;\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
  const line = (row: string[]) =>
    // A row of one empty field would be an empty line, which readers skip.
    row.length === 1 && row[0] === "" ? '""' : row.map(field).join(",")
  return `\uFEFF${rows.map((row) => `${line(row)}\r\n`).join("")}`
}

// Excel and Sheets run a cell starting with one of these as a formula, so
// "- saw a turtle" would show an error (and a crafted one could do worse).
// Spaces before one, or its full-width form, can be trimmed or read alike.
const formulaStart = /^(?:[\t\r]|\s*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])/

export const cell = (value: Cell) =>
  value == null
    ? ""
    : typeof value === "number"
      ? decimal(value)
      : formulaStart.test(value)
        ? `'${value}`
        : value

// To 0.01 min, so the seconds can be worked back out (2,851 s is 47.52).
const minutes = (seconds: number | null) =>
  seconds == null ? null : Math.round(secondsToMinutes(seconds) * 100) / 100

const label = <O extends Record<string, { label: string }>>(
  options: O,
  key: string | null
) => (key == null ? null : (options[key]?.label ?? key))

interface DiveRow {
  id: string
  number: number | null
  startTime: string
  duration: number
  maxDepth: number
  averageDepth: number | null
  siteName: string
  regionName: string | null
  countryCode: string
  bodyOfWater: string | null
  waterType: WaterType
  diveType: string
  trainingAgency: string | null
  trainingCourse: string | null
  tripName: string | null
  diveCentreName: string | null
  entry: string | null
  current: string | null
  surge: string | null
  surface: string | null
  weather: string | null
  workload: string | null
  thermalComfort: string | null
  minTemperature: number | null
  maxTemperature: number | null
  visibility: number | null
  visibilityRating: string | null
  surfaceInterval: number | null
  weight: number | null
  cylinderMaterial: string | null
  cylinderVolume: number | null
  nitrox: number
  oxygen: number | null
  startPressure: number | null
  endPressure: number | null
  cns: number | null
  otu: number | null
  notableAnimals: string | null
  gearDetails: string | null
  notes: string | null
  ignored: number
  computerModel: string | null
  ascentAlarmCount: number
  sampleDuration: number | null
  sampleAverageDepth: number | null
}

const diveQuery = `
  SELECT d.id, d.number, d.start_time AS startTime, d.duration,
    d.max_depth AS maxDepth, d.average_depth AS averageDepth,
    s.name AS siteName, r.name AS regionName, s.country_code AS countryCode,
    s.body_of_water AS bodyOfWater, s.water_type AS waterType,
    d.dive_type AS diveType, d.training_agency AS trainingAgency,
    d.training_course AS trainingCourse, t.name AS tripName,
    c.name AS diveCentreName, d.entry, d.current, d.surge, d.surface,
    d.weather, d.workload, d.thermal_comfort AS thermalComfort,
    d.min_temperature AS minTemperature, d.max_temperature AS maxTemperature,
    d.visibility, d.visibility_rating AS visibilityRating,
    d.surface_interval AS surfaceInterval, d.weight,
    d.cylinder_material AS cylinderMaterial,
    d.cylinder_volume AS cylinderVolume, d.nitrox, d.oxygen,
    d.start_pressure AS startPressure, d.end_pressure AS endPressure,
    d.cns, d.otu, d.notable_animals AS notableAnimals,
    d.gear_details AS gearDetails, d.notes, d.ignored,
    d.computer_model AS computerModel,
    d.ascent_alarm_count AS ascentAlarmCount,
    d.sample_duration AS sampleDuration,
    d.sample_average_depth AS sampleAverageDepth
  FROM dives d
  JOIN sites s ON s.id = d.site_id
  LEFT JOIN regions r ON r.id = s.region_id
  LEFT JOIN trips t ON t.id = d.trip_id
  LEFT JOIN dive_centres c ON c.id = d.dive_centre_id
  WHERE d.deleted_at IS NULL
  ORDER BY d.start_time, d.seq`

// Each column's header and how a dive fills it, in the spec's order.
const columns: [string, (dive: DiveRow, more: Extra) => Cell][] = [
  ["Dive id", (d) => d.id],
  ["Number", (d) => d.number],
  ["Date", (d) => d.startTime.slice(0, 10)],
  ["Time", (d) => d.startTime.slice(11)],
  ["Duration (min)", (d) => minutes(d.duration)],
  ["Max depth (m)", (d) => d.maxDepth],
  ["Average depth (m)", (d) => d.averageDepth],
  ["Site", (d) => d.siteName],
  ["Region", (d) => d.regionName],
  ["Country", (d) => countryName(d.countryCode)],
  ["Body of water", (d) => label(bodiesOfWater, d.bodyOfWater)],
  ["Water type", (d) => label(waterTypes, d.waterType)],
  ["Dive type", (d) => label(diveTypes, d.diveType)],
  ["Training agency", (d) => d.trainingAgency],
  ["Training course", (d) => d.trainingCourse],
  ["Tags", (_, x) => x.tags],
  ["Trip", (d) => d.tripName],
  ["Dive centre", (d) => d.diveCentreName],
  ["Buddies", (_, x) => x.buddies],
  ["Dive professionals", (_, x) => x.professionals],
  ["Entry", (d) => label(entries, d.entry)],
  ["Current", (d) => label(currents, d.current)],
  ["Surge", (d) => label(surges, d.surge)],
  ["Surface", (d) => label(surfaces, d.surface)],
  ["Weather", (d) => label(weathers, d.weather)],
  ["Workload", (d) => label(workloads, d.workload)],
  ["Thermal comfort", (d) => label(thermalComforts, d.thermalComfort)],
  ["Min temperature (°C)", (d) => d.minTemperature],
  ["Max temperature (°C)", (d) => d.maxTemperature],
  ["Visibility (m)", (d) => d.visibility],
  ["Visibility rating", (d) => label(visibilityRatings, d.visibilityRating)],
  ["Surface interval (min)", (d) => minutes(d.surfaceInterval)],
  ["Weight (kg)", (d) => d.weight],
  ["Cylinder material", (d) => label(cylinderMaterials, d.cylinderMaterial)],
  [
    "Cylinder volume (L)",
    (d) =>
      d.cylinderVolume == null ? null : millilitresToLitres(d.cylinderVolume),
  ],
  [
    "Oxygen (%)",
    (_, x) => (x.oxygen == null ? null : tenthsToPercent(x.oxygen)),
  ],
  ["Start pressure (bar)", (d) => d.startPressure],
  ["End pressure (bar)", (d) => d.endPressure],
  ["SAC (L/min)", (_, x) => x.sac],
  ["MOD (m)", (_, x) => x.mod],
  ["Max PO₂ (bar)", (_, x) => x.maxPo2],
  ["CNS (%)", (d) => d.cns],
  ["OTU", (d) => d.otu],
  ["Notable animals", (d) => d.notableAnimals],
  ["Gear details", (d) => d.gearDetails],
  ["Notes", (d) => d.notes],
  ["Ignored", (d) => (d.ignored ? "Yes" : "No")],
  ["Dive computer", (d) => d.computerModel],
  ["Ascent alarms", (_, x) => x.ascentAlarms],
  ["Profile", (_, x) => x.profile],
]

interface Extra {
  tags: string | null
  buddies: string | null
  professionals: string | null
  oxygen: number | null
  sac: number | null
  mod: number | null
  maxPo2: number | null
  profile: string | null
  ascentAlarms: number | null
}

export const csvHeaders = columns.map(([header]) => header)

export function writeCsv(db: Db): { csv: string; dives: number } {
  return db.transaction(() => build(db))()
}

function build(db: Db) {
  const all = <R>(sql: string) => db.prepare<[], R>(sql).all()
  const grouped = <R extends { diveId: string }, V>(
    sql: string,
    value: (row: R) => V
  ) => byDive(all<R>(sql), value)
  // A name can hold a comma, so several are joined with a semicolon.
  const joined = (names?: string[]) => (names?.length ? names.join("; ") : null)

  const people = (table: string) =>
    grouped<{ diveId: string; name: string }, string>(
      `SELECT l.dive_id AS diveId, p.name FROM ${table} l JOIN people p ON p.id = l.person_id ORDER BY l.dive_id, l.position`,
      (row) => row.name
    )
  const buddies = people("dive_buddies")
  const professionals = people("dive_professionals")
  const tagsOf = grouped<{ diveId: string; tag: string }, string>(
    "SELECT dive_id AS diveId, tag FROM dive_tags",
    (row) => row.tag
  )
  // SAC takes a hand duration or average depth over the samples' figures,
  // as the dive detail does.
  const hand = grouped<{ diveId: string; field: string }, string>(
    "SELECT dive_id AS diveId, field FROM field_meta WHERE source = 'hand' AND field IN ('duration', 'averageDepth')",
    (row) => row.field
  )
  const { maxPo2: limit } = readSettings(db)

  const samplesOf = selectSamples(db)
  const eventsOf = selectEvents(db)
  // Compact JSON arrays, trailing nulls dropped, so a long dive still fits
  // a spreadsheet cell (about 12 characters a sample).
  const trim = (values: (string | number | null)[]) => {
    let end = values.length
    while (end > 0 && values[end - 1] == null) end--
    return values.slice(0, end)
  }
  const profile = (diveId: string) => {
    const samples = samplesOf.all(diveId)
    if (!samples.length) return null
    return JSON.stringify({
      samples: samples.map((s) =>
        trim([s.time, s.depth, s.temperature, s.pressure])
      ),
      events: eventsOf.all(diveId).map((e) => trim([e.type, e.start, e.end])),
    })
  }

  const dives = all<DiveRow>(diveQuery)
  const rows = dives.map((dive) => {
    const water = { waterType: dive.waterType }
    const oxygen = diveOxygen({ nitrox: !!dive.nitrox, oxygen: dive.oxygen })
    const handFields = hand.get(dive.id) ?? []
    const modDepth = oxygen == null ? null : mod(oxygen, limit, water)
    const tagKeys = tagsOf.get(dive.id)
    const profileJson = profile(dive.id)
    const extra: Extra = {
      // In the app's order, whatever order they were stored in.
      tags: joined(
        keysOf(tags)
          .filter((key) => tagKeys?.includes(key))
          .map((key) => tags[key].label)
      ),
      buddies: joined(buddies.get(dive.id)),
      professionals: joined(professionals.get(dive.id)),
      oxygen,
      sac: diveSacRate(
        { ...dive, nitrox: !!dive.nitrox },
        {
          duration: handFields.includes("duration"),
          averageDepth: handFields.includes("averageDepth"),
        },
        water
      ),
      // A limit at or below the surface PO₂ gives no depth (-0 too).
      mod: modDepth != null && modDepth > 0 ? modDepth : null,
      maxPo2: oxygen == null ? null : maxPo2(oxygen, dive.maxDepth, water),
      profile: profileJson,
      // Only a computer's samples carry alarms, so a hand-logged dive has no
      // count rather than none.
      ascentAlarms: profileJson == null ? null : dive.ascentAlarmCount,
    }
    return columns.map(([, value]) => cell(value(dive, extra)))
  })

  return {
    csv: encodeCsv([csvHeaders, ...rows]),
    dives: dives.length,
  }
}
