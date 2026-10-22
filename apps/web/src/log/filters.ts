import { normaliseName, toMillimetres, type Tag } from "@shylog/core"

import type { Dive } from "@/data/db"
import type { LogView } from "@/data/log"
import { monthKey, monthLabel, year } from "@/format/dates"

// A slider range in its own units, metres or minutes. The top of the scale
// means no upper limit, so the deepest and longest dives are never cut off.
export interface Range {
  min: number
  max: number
}

export const depthScale = { min: 0, max: 40, step: 1 } as const
export const durationScale = { min: 0, max: 90, step: 5 } as const

export interface Filters {
  year?: string
  tag?: Tag
  region?: string
  depth?: Range
  duration?: Range
}

// Bounds included, in the slider's whole units: the dive is rounded to
// whole metres and minutes first, from whole mm and seconds, so a 30.4 m
// dive is inside 18–30 m and a 29:40 dive inside 30–90 min.
export function inDepthRange(maxDepth: number, range: Range) {
  const metres = Math.round(toMillimetres(maxDepth) / 1000)
  return (
    metres >= range.min && (range.max >= depthScale.max || metres <= range.max)
  )
}

// A dive with no duration only fails a range that starts above 0.
export function inDurationRange(duration: number | null, range: Range) {
  const minutes = Math.round((duration ?? 0) / 60)
  return (
    minutes >= range.min &&
    (range.max >= durationScale.max || minutes <= range.max)
  )
}

export const isFullRange = (
  range: Range,
  scale: { min: number; max: number }
) => range.min <= scale.min && range.max >= scale.max

export function matchesFilters(dive: Dive, filters: Filters, log: LogView) {
  if (filters.year && year(dive.startTime) !== filters.year) return false
  if (filters.tag && !log.links.get(dive.id)?.tags.includes(filters.tag))
    return false
  if (filters.region && log.sites.get(dive.siteId)?.regionId !== filters.region)
    return false
  if (filters.depth && !inDepthRange(dive.maxDepth, filters.depth)) return false
  if (filters.duration && !inDurationRange(dive.duration, filters.duration))
    return false
  return true
}

// Site, buddies, animals and notes, ignoring case, spacing and accents.
export function matchesSearch(dive: Dive, query: string, log: LogView) {
  const needle = normaliseName(query)
  if (!needle) return true
  const buddies = log.links.get(dive.id)?.buddies ?? []
  return [
    log.sites.get(dive.siteId)?.name,
    ...buddies.map((id) => log.people.get(id)?.name),
    dive.notableAnimals,
    dive.notes,
  ].some((text) => text && normaliseName(text).includes(needle))
}

// The header's figures, leaving out ignored dives.
export function headerFigures(dives: readonly Dive[]) {
  const counted = dives.filter((dive) => !dive.ignored)
  return {
    count: counted.length,
    seconds: counted.reduce((sum, dive) => sum + (dive.duration ?? 0), 0),
    deepest: counted.length
      ? Math.max(...counted.map((dive) => dive.maxDepth))
      : null,
  }
}

export interface MonthGroup {
  key: string
  label: string
  // Leaves out ignored dives, as the header does.
  count: number
  dives: Dive[]
}

// Dives arrive newest first, so groups do too.
export function monthGroups(dives: readonly Dive[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  for (const dive of dives) {
    const key = monthKey(dive.startTime)
    let group = groups.at(-1)
    if (group?.key !== key) {
      group = { key, label: monthLabel(dive.startTime), count: 0, dives: [] }
      groups.push(group)
    }
    group.dives.push(dive)
    if (!dive.ignored) group.count++
  }
  return groups
}
