import {
  countryName,
  currents,
  diveOxygen,
  entries,
  surfaces,
  surges,
  tags as allTags,
  thermalComforts,
  toMillimetres,
  visibilityRatings,
  weathers,
  workloads,
  type Tag,
} from "@shylog/core"

import type { Dive } from "@/data/db"
import type { LogView } from "@/data/log"
import { year as yearOf } from "@/format/dates"
import { diveSac } from "@/dive/figures"

import { anniversary, depthDescended, descended, streaks } from "./records"
import { sacTrend } from "./trend"

// The dives Statistics counts: not ignored, and not a draft the server
// refused, which takes no number, as the Log's header leaves them out.
// Oldest first, so ties go to the earlier dive.
export const countedDives = (log: LogView) =>
  log.dives.filter((dive) => !dive.ignored && !dive.rejected).reverse()

// The years with a counted dive, newest first.
export const statsYears = (dives: readonly Dive[]) =>
  [...new Set(dives.map((dive) => yearOf(dive.startTime)))].sort().reverse()

export interface Share {
  key: string
  label: string
  count: number
}

// A choice field's counts in its own order, with the dives that didn't log
// it, and the most common value (the earlier level on a tie).
export interface Breakdown {
  levels: Share[]
  notLogged: number
  top: Share | null
}

function breakdown(
  dives: readonly Dive[],
  options: Record<string, { label: string }>,
  value: (dive: Dive) => string | null | undefined
): Breakdown {
  const levels = Object.entries(options).map(([key, { label }]) => ({
    key,
    label,
    count: 0,
  }))
  let notLogged = 0
  for (const dive of dives) {
    const key = value(dive)
    const level = levels.find((option) => option.key === key)
    if (level) level.count++
    else notLogged++
  }
  const top = levels.reduce<Share | null>(
    (best, level) =>
      level.count && (!best || level.count > best.count) ? level : best,
    null
  )
  return { levels, notLogged, top }
}

// Visibility in metres joins the rough rating, grouped as the Patterns
// section of the spec groups it: under 5 m low, 5 to 10 m average, over
// 10 m high. Compared in whole mm, never as floats.
function visibilityLevel(dive: Dive) {
  if (dive.visibilityRating) return dive.visibilityRating
  if (dive.visibility == null) return null
  const mm = toMillimetres(dive.visibility)
  return mm < 5000 ? "low" : mm <= 10_000 ? "average" : "high"
}

// Thermal comfort from cold to hot, as the board draws it, rather than the
// form's order with Comfortable first.
const thermalLevels = {
  veryCold: thermalComforts.veryCold,
  cold: thermalComforts.cold,
  comfortable: thermalComforts.comfortable,
  hot: thermalComforts.hot,
}

// The record holder, the earlier dive on a tie, as dives come oldest first.
function record(
  dives: readonly Dive[],
  value: (dive: Dive) => number | null | undefined,
  better: (a: number, b: number) => boolean
) {
  let best: { dive: Dive; value: number } | null = null
  for (const dive of dives) {
    const v = value(dive)
    if (v != null && (!best || better(v, best.value))) best = { dive, value: v }
  }
  return best
}

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null

// The spec's bands (0 to 10, 10 to 18, 18 to 30 and over 30 m), in whole mm,
// so a 10.0 m dive is in 10 to 18.
export const depthBands = [
  { label: "0–10 m", below: 10_000 },
  { label: "10–18 m", below: 18_000 },
  { label: "18–30 m", below: 30_000 },
  { label: "30+ m", below: Infinity },
] as const

// By local start time: morning before 11:00, midday to 14:00, afternoon to
// 18:00 and night after.
export const timesOfDay = [
  { key: "morning", label: "Morning", below: 11 },
  { key: "midday", label: "Midday", below: 14 },
  { key: "afternoon", label: "Afternoon", below: 18 },
  { key: "night", label: "Night", below: 24 },
] as const

function ranked<T>(
  counts: Map<string, number>,
  name: (key: string) => T & { name: string },
  limit = 5
) {
  return [...counts]
    .map(([key, count]) => ({ key, count, ...name(key) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
}

function tally(keys: Iterable<string>, counts = new Map<string, number>()) {
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
  return counts
}

// Every figure and chart on Statistics for one year (undefined for all
// time), from the counted dives of the whole log. today is the phone's
// local date, YYYY-MM-DD, for running streaks and the anniversary.
export function statistics(
  log: LogView,
  year: string | undefined,
  today: string
) {
  const all = countedDives(log)
  const dives = year ? all.filter((d) => yearOf(d.startTime) === year) : all
  const seconds = dives.reduce((sum, dive) => sum + dive.duration, 0)

  // Dives per month for a year, per year (gaps included) for all time.
  let perPeriod: { label: string; count: number }[]
  if (year) {
    const months = Array.from({ length: 12 }, () => 0)
    for (const dive of dives) months[Number(dive.startTime.slice(5, 7)) - 1]!++
    perPeriod = months.map((count, i) => ({ label: String(i + 1), count }))
  } else {
    const years = statsYears(dives).map(Number)
    const first = Math.min(...years)
    const counts = tally(dives.map((dive) => yearOf(dive.startTime)))
    perPeriod = years.length
      ? Array.from({ length: Math.max(...years) - first + 1 }, (_, i) => {
          const label = String(first + i)
          return { label, count: counts.get(label) ?? 0 }
        })
      : []
  }

  // Duration-weighted, leaving out rates of 0.1 L/min or less as bogus, as
  // Subsurface's process_dive does.
  const rated = dives.flatMap((dive) => {
    const sac = diveSac(dive, log)
    return sac != null && sac > 0.1 ? [{ dive, sac }] : []
  })
  const ratedSeconds = rated.reduce((sum, r) => sum + r.dive.duration, 0)
  const averageSac = ratedSeconds
    ? rated.reduce((sum, r) => sum + r.sac * r.dive.duration, 0) / ratedSeconds
    : null

  const temperatures = dives.flatMap((dive) => {
    const low = dive.minTemperature ?? dive.maxTemperature
    const high = dive.maxTemperature ?? dive.minTemperature
    return low == null || high == null ? [] : [{ low, high }]
  })

  const nitrox = dives.filter((dive) => dive.nitrox)
  const nitroxOxygen = mean(
    nitrox.flatMap((dive) => {
      const oxygen = diveOxygen(dive)
      return oxygen == null ? [] : [oxygen]
    })
  )

  const entryCounts = breakdown(dives, entries, (dive) => dive.entry)
  const siteCounts = tally(dives.map((dive) => dive.siteId))
  const buddyCounts = tally(
    dives.flatMap((dive) => log.links.get(dive.id)?.buddies ?? [])
  )
  // A site with no region counts under its country, as a card's place does.
  const regionCounts = tally(
    dives.flatMap((dive) => {
      const site = log.sites.get(dive.siteId)
      if (!site) return []
      return [site.regionId ?? `country:${site.countryCode}`]
    })
  )
  const tagCounts = tally(
    dives.flatMap((dive) => log.links.get(dive.id)?.tags ?? [])
  )
  const tagKeys = Object.keys(allTags) as Tag[]

  const deep = record(
    dives,
    (d) => d.maxDepth,
    (a, b) => a > b
  )
  const long = record(
    dives,
    (d) => d.duration,
    (a, b) => a > b
  )
  const coldest = record(
    dives,
    (d) => d.minTemperature,
    (a, b) => a < b
  )
  const warmest = record(
    dives,
    (d) => d.minTemperature,
    (a, b) => a > b
  )
  const metres = depthDescended(dives)

  return {
    count: dives.length,
    seconds,
    perPeriod,
    records: {
      deepest: deep,
      longest: long,
      coldest,
      warmest,
      descended: dives.length ? { metres, ...descended(metres) } : null,
      ...streaks(dives, today),
      // The whole log's, whatever the year.
      anniversary: anniversary(all, today),
    },
    averageMaxDepth: mean(dives.map((dive) => dive.maxDepth)),
    averageDuration: mean(dives.map((dive) => dive.duration)),
    water: temperatures.length
      ? {
          min: Math.min(...temperatures.map((t) => t.low)),
          max: Math.max(...temperatures.map((t) => t.high)),
        }
      : null,
    sac: {
      average: averageSac,
      trend: sacTrend(rated),
    },
    depthBands: depthBands.map((band, i) => ({
      label: band.label,
      count: dives.filter((dive) => {
        const mm = toMillimetres(dive.maxDepth)
        return mm < band.below && (i === 0 || mm >= depthBands[i - 1]!.below)
      }).length,
    })),
    conditions: [
      {
        key: "current",
        label: "Current",
        ...breakdown(dives, currents, (d) => d.current),
      },
      {
        key: "surge",
        label: "Surge",
        ...breakdown(dives, surges, (d) => d.surge),
      },
      {
        key: "visibility",
        label: "Visibility",
        ...breakdown(dives, visibilityRatings, visibilityLevel),
      },
      {
        key: "workload",
        label: "Workload",
        ...breakdown(dives, workloads, (d) => d.workload),
      },
      {
        key: "thermalComfort",
        label: "Thermal comfort",
        ...breakdown(dives, thermalLevels, (d) => d.thermalComfort),
      },
    ],
    weather: breakdown(dives, weathers, (dive) => dive.weather),
    surface: breakdown(dives, surfaces, (dive) => dive.surface),
    timeOfDay: timesOfDay.map((part, i) => ({
      key: part.key,
      label: part.label,
      count: dives.filter((dive) => {
        const hour = Number(dive.startTime.slice(11, 13))
        return (
          hour < part.below && (i === 0 || hour >= timesOfDay[i - 1]!.below)
        )
      }).length,
    })),
    gas: {
      air: dives.length - nitrox.length,
      nitrox: nitrox.length,
      // Tenths of a per cent, as the database stores a mix.
      averageOxygen: nitroxOxygen,
    },
    // Most dives first, the form's order on a tie.
    entry: {
      ...entryCounts,
      levels: entryCounts.levels
        .filter((level) => level.count)
        .sort((a, b) => b.count - a.count),
    },
    sites: ranked(siteCounts, (id) => {
      const site = log.sites.get(id)
      const region = site?.regionId ? log.regions.get(site.regionId) : undefined
      return {
        name: site?.name ?? "",
        place: region ? region.name : site ? countryName(site.countryCode) : "",
      }
    }),
    buddies: ranked(buddyCounts, (id) => ({
      name: log.people.get(id)?.name ?? "",
    })),
    regions: ranked(regionCounts, (key) => {
      if (key.startsWith("country:"))
        return { name: countryName(key.slice(8)), country: null }
      const region = log.regions.get(key)
      return {
        name: region?.name ?? "",
        country: region ? countryName(region.countryCode) : null,
      }
    }),
    tags: tagKeys
      .filter((tag) => tagCounts.get(tag))
      .map((tag) => ({
        key: tag,
        label: allTags[tag].label,
        count: tagCounts.get(tag)!,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  }
}

export type Statistics = ReturnType<typeof statistics>
