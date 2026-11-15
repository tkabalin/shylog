import { computerAir, isFullStop } from "@shylog/core"

import type { Db } from "../db/open.ts"
import { gasFigures } from "../figures.ts"
import { selectSamples } from "../profile.ts"
import type { Log } from "../routes/log.ts"
import { params } from "./params.ts"

export type Dive = Log["dives"][number]

const byId = <T extends { id: string }>(rows: T[]) =>
  new Map(rows.map((row) => [row.id, row]))

// One read of the log, with each dive's links and field sources at hand.
export function indexLog(log: Log) {
  const links = new Map<
    string,
    { buddies: string[]; professionals: string[]; tags: string[] }
  >()
  for (const link of log.links) {
    let entry = links.get(link.diveId)
    if (!entry) {
      entry = { buddies: [], professionals: [], tags: [] }
      links.set(link.diveId, entry)
    }
    const list = link.type === "buddy" ? "buddies" : (`${link.type}s` as const)
    entry[list].push(link.target)
  }
  const meta = new Map<string, Log["fieldMeta"]>()
  for (const row of log.fieldMeta) {
    meta.set(row.diveId, [...(meta.get(row.diveId) ?? []), row])
  }
  return {
    log,
    sites: byId(log.sites),
    regions: byId(log.regions),
    people: byId(log.people),
    centres: byId(log.diveCentres),
    trips: byId(log.trips),
    links,
    meta,
  }
}
export type LogIndex = ReturnType<typeof indexLog>

// Minutes to 0.1, as a dive's seconds rarely make whole ones.
export const minutes = (seconds: number) => Math.round(seconds / 6) / 10
// To 0.01 for a value a tool takes back, which then converts to the same
// second, so sending it back unchanged changes nothing.
const exactMinutes = (seconds: number) => Math.round(seconds / 0.6) / 100

const oxygenPercent = (dive: Pick<Dive, "nitrox" | "oxygen">) =>
  dive.nitrox && dive.oxygen != null ? dive.oxygen / 10 : ("air" as const)

export const gasName = (dive: Pick<Dive, "nitrox" | "oxygen">) => {
  const oxygen = oxygenPercent(dive)
  return oxygen === "air" ? "air" : `EANx${oxygen}`
}

const named = (row?: { id: string; name: string }) =>
  row ? { id: row.id, name: row.name } : null

export function linksOf(index: LogIndex, dive: Dive) {
  return (
    index.links.get(dive.id) ?? { buddies: [], professionals: [], tags: [] }
  )
}

// SAC, MOD and max PO₂ as the dive's detail shows them.
export function figuresOf(index: LogIndex, dive: Dive) {
  const hand = new Set(
    (index.meta.get(dive.id) ?? [])
      .filter((row) => row.source === "hand")
      .map((row) => row.field)
  )
  const site = index.sites.get(dive.siteId)
  return gasFigures(
    dive,
    { duration: hand.has("duration"), averageDepth: hand.has("averageDepth") },
    site?.waterType === "fresh" ? "fresh" : "salt",
    index.log.settings.maxPo2
  )
}

// Leaves out empty values, so a reply spends tokens only on what was logged.
export function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, field]) =>
        field != null &&
        field !== false &&
        !(Array.isArray(field) && field.length === 0)
    )
  ) as Partial<T>
}

// A search result's row: enough to pick the dive out and name it.
export function diveRow(index: LogIndex, dive: Dive) {
  const links = linksOf(index, dive)
  return compact({
    number: dive.number,
    id: dive.id,
    startTime: dive.startTime,
    site: index.sites.get(dive.siteId)?.name,
    durationMin: exactMinutes(dive.duration),
    maxDepthM: dive.maxDepth,
    gas: gasName(dive),
    sacLPerMin: figuresOf(index, dive).sac,
    buddies: links.buddies.map((id) => index.people.get(id)?.name),
    tags: links.tags,
    ignored: dive.ignored,
    deleted: dive.deletedAt != null,
  })
}

// A computer's reading in app units, as kept beside a hand value.
function reading(field: string, value: string | number | null) {
  if (value == null || typeof value === "string") return value
  if (field === "duration") return exactMinutes(value)
  if (field === "oxygen") return value === computerAir ? "air" : value / 10
  return value
}

// Everything about one dive, in the app's units.
export function diveDetail(index: LogIndex, dive: Dive) {
  const links = linksOf(index, dive)
  const site = index.sites.get(dive.siteId)
  const region = site?.regionId ? index.regions.get(site.regionId) : undefined
  const figures = figuresOf(index, dive)
  const meta = index.meta.get(dive.id) ?? []
  return compact({
    number: dive.number,
    id: dive.id,
    deleted: dive.deletedAt != null,
    ignored: dive.ignored,
    startTime: dive.startTime,
    site: site && {
      ...compact({
        id: site.id,
        name: site.name,
        countryCode: site.countryCode,
        region: named(region),
        bodyOfWater: site.bodyOfWater,
      }),
      water: site.waterType,
    },
    durationMin: exactMinutes(dive.duration),
    maxDepthM: dive.maxDepth,
    averageDepthM: dive.averageDepth,
    diveType: dive.diveType,
    trainingAgency: dive.trainingAgency,
    trainingCourse: dive.trainingCourse,
    tags: links.tags,
    trip: named(dive.tripId ? index.trips.get(dive.tripId) : undefined),
    diveCentre: named(
      dive.diveCentreId ? index.centres.get(dive.diveCentreId) : undefined
    ),
    buddies: links.buddies.map((id) => named(index.people.get(id))),
    professionals: links.professionals.map((id) => named(index.people.get(id))),
    entry: dive.entry,
    current: dive.current,
    surge: dive.surge,
    surface: dive.surface,
    weather: dive.weather,
    minTemperatureC: dive.minTemperature,
    maxTemperatureC: dive.maxTemperature,
    visibilityM: dive.visibility,
    visibilityRating: dive.visibilityRating,
    workload: dive.workload,
    thermalComfort: dive.thermalComfort,
    surfaceIntervalMin:
      dive.surfaceInterval === "none"
        ? "none"
        : exactMinutes(dive.surfaceInterval),
    surfaceIntervalSetByHand: dive.surfaceIntervalOverride,
    weightKg: dive.weight,
    cylinderMaterial: dive.cylinderMaterial,
    cylinderVolumeL:
      dive.cylinderVolume == null ? null : dive.cylinderVolume / 1000,
    oxygenPercent: oxygenPercent(dive),
    startPressureBar: dive.startPressure,
    endPressureBar: dive.endPressure,
    notableAnimals: dive.notableAnimals,
    gearDetails: dive.gearDetails,
    notes: dive.notes,
    computerModel: dive.computerModel,
    figures: compact({
      sacLPerMin: figures.sac,
      modM: figures.mod,
      maxPo2Bar: figures.maxPo2,
      maxPo2LimitBar: index.log.settings.maxPo2,
      cnsPercent: dive.cns,
      otu: dive.otu,
    }),
    // Only a computer's samples give a stop or alarms, so a hand-logged
    // dive has none rather than zero.
    safetyStop: dive.safetyStop && {
      atMin: minutes(dive.safetyStop.start),
      heldMin: minutes(dive.safetyStop.held),
      depthM: Math.round(dive.safetyStop.depth / 100) / 10,
      full: isFullStop(dive.safetyStop),
    },
    ascentAlarms: dive.sparkline ? dive.ascentAlarmCount : null,
    // Who entered each value: the diver by hand, or the dive computer. The
    // gas is one value over Nitrox and the oxygen, the diver's if either is.
    sources: meta.reduce<Record<string, string>>((sources, row) => {
      const field = params[row.field] ?? row.field
      if (sources[field] !== "hand") sources[field] = row.source
      return sources
    }, {}),
    // A computer's reading kept beside the diver's own value, which can be
    // taken (adopt) or kept out of the comparison (dismiss).
    computerReadings: meta
      .filter((row) => row.computerValue != null && row.source === "hand")
      .map((row) =>
        compact({
          field: params[row.field] ?? row.field,
          computerValue: reading(row.field, row.computerValue),
          dismissed: row.dismissed,
        })
      ),
  })
}

// A minute-by-minute line of the dive, the deepest point and the water
// temperature in each minute, with the computer's events.
export function profileOf(
  db: Db,
  dive: Dive,
  events: { type: string; start: number; end: number | null }[]
) {
  const samples = selectSamples(db).all(dive.id)
  if (!samples.length) return null
  const perMinute: { min: number; depthM: number; temperatureC?: number }[] = []
  let temperature: number | null = null
  for (const sample of samples) {
    temperature = sample.temperature ?? temperature
    const min = Math.floor(sample.time / 60)
    const last = perMinute.at(-1)
    if (last?.min === min) {
      last.depthM = Math.max(last.depthM, sample.depth)
      if (temperature != null) last.temperatureC = temperature
    } else {
      perMinute.push({
        min,
        depthM: sample.depth,
        ...(temperature == null ? {} : { temperatureC: temperature }),
      })
    }
  }
  return {
    perMinute,
    events: events.map((event) =>
      compact({
        type: event.type,
        atMin: minutes(event.start),
        endMin: event.end == null ? null : minutes(event.end),
      })
    ),
  }
}
