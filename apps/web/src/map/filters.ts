import { normaliseName } from "@shylog/core"

import { decodeRange, depthScale, encodeRange, type Range } from "@/log/filters"

import { sites, type Site, type SiteType } from "./sites"
import { zoneAt } from "./zone-at"

// The map's filters: a site of any of the ticked types, with its max depth
// in the range. Kept in the address, as the Log's are.
export type SiteFilters = { types: SiteType[]; depth?: Range }

export const typeOptions: { value: SiteType; label: string }[] = [
  { value: "reef", label: "Reefs" },
  { value: "wreck", label: "Wrecks" },
  { value: "fresh", label: "Fresh water" },
]

export function filtersOf(search: { types?: string; depth?: string }) {
  const types = (search.types?.split(",") ?? []).filter(
    (type, i, all): type is SiteType =>
      typeOptions.some((option) => option.value === type) &&
      all.indexOf(type) === i
  )
  return { types, depth: decodeRange(search.depth, depthScale) }
}

// The filters as the address keeps them, "?types=wreck,fresh&depth=18-30".
export const searchOf = ({ types, depth }: SiteFilters) => ({
  types: types.join(",") || undefined,
  depth: encodeRange(depth),
})

// A site whose depth nobody knows can't be shown as inside a range. Its
// depth is in whole metres already; the top of the scale has no limit.
export function matchesSite(site: Site, { types, depth }: SiteFilters) {
  if (types.length && !types.includes(site.type)) return false
  if (!depth) return true
  if (site.depth === undefined || site.depth < depth.min) return false
  return depth.max >= depthScale.max || site.depth <= depth.max
}

export const filterSites = (filters: SiteFilters) =>
  filters.types.length || filters.depth
    ? sites.filter((site) => matchesSite(site, filters))
    : sites

// The list's search, among the sites the filters leave, as the Log's search
// narrows its filtered cards: names alone, ignoring case, accents,
// punctuation and spaces, so "millers" finds Miller's Point and "a frame"
// A-Frame.
const fold = (text: string) =>
  normaliseName(text).replace(/[^\p{L}\p{N}\p{M}]/gu, "")
const folded = new Map<string, string>()
export function searchSites(query: string, among: readonly Site[] = sites) {
  const needle = fold(query)
  if (!needle) return among
  return among.filter((site) => {
    let name = folded.get(site.id)
    if (name === undefined) folded.set(site.id, (name = fold(site.name)))
    return name.includes(needle)
  })
}

// What a list row says about diving there, from the strictest zone the site
// lies in: only where it limits who can dive, as no-take zones don't.
export type ZoneNote = { text: string; warn?: true }
const notes = new Map<string, ZoneNote | null>()
export function zoneNote(site: Site): ZoneNote | undefined {
  let note = notes.get(site.id)
  if (note === undefined) {
    const zone = zoneAt([site.lon, site.lat])
    note =
      zone?.kind === "no-dive"
        ? { text: "No diving", warn: true }
        : zone?.kind === "shore-only"
          ? { text: "Shore dives only" }
          : zone?.id === "robben-island" || zone?.id === "robben-abalone"
            ? { text: "Dive business only" }
            : null
    notes.set(site.id, note)
  }
  return note ?? undefined
}
