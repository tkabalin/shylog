import { decodeRange, depthScale, encodeRange, type Range } from "@/log/filters"

import { sites, type Site, type SiteType } from "./sites"

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
