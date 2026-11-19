import { decodeRange, depthScale, encodeRange, type Range } from "@/log/filters"

import {
  sites,
  type Compass,
  type GoodFor,
  type Need,
  type Season,
  type Site,
  type SiteType,
} from "./sites"
import { matchesTags, type TagFilters, type Way } from "./tags"

// Asks for no special skills, or not for one of these. "basic" in the
// address, which reads better there than a negative.
export type Skill = "basic" | Need

// The map's filters: a site of any of the ticked types, with its max depth
// in the range, and the ways in and page tags. Kept in the address, as the
// Log's are. Skills stay one list, in the order ticked, as their pill shows.
export type SiteFilters = {
  types: SiteType[]
  depth?: Range
  skills?: Skill[]
} & Omit<TagFilters, "noSpecialSkills" | "avoid">

type Option<T> = { value: T; label: string }

export const typeOptions: Option<SiteType>[] = [
  { value: "reef", label: "Reefs" },
  { value: "wreck", label: "Wrecks" },
  { value: "fresh", label: "Fresh water" },
]

export const accessOptions: Option<Way>[] = [
  // Not "Shore dives", which the list's rows use for the MPA rule.
  { value: "shore", label: "From shore" },
  { value: "boat", label: "By boat" },
]

export const compassOptions: Option<Compass>[] = [
  { value: "n", label: "North" },
  { value: "ne", label: "North-east" },
  { value: "e", label: "East" },
  { value: "se", label: "South-east" },
  { value: "s", label: "South" },
  { value: "sw", label: "South-west" },
  { value: "w", label: "West" },
  { value: "nw", label: "North-west" },
]

export const seasonOptions: Option<Season>[] = [
  { value: "summer", label: "Summer" },
  { value: "autumn", label: "Autumn" },
  { value: "winter", label: "Winter" },
  { value: "spring", label: "Spring" },
]

export const skillOptions: Option<Skill>[] = [
  { value: "basic", label: "No special skills" },
  { value: "navigation", label: "No navigation" },
  { value: "dsmb", label: "No DSMB" },
  { value: "fitness", label: "No hard walk or swim" },
  { value: "buoyancy", label: "No fine buoyancy" },
]

export const goodForOptions: Option<GoodFor>[] = [
  { value: "night", label: "Night dives" },
  { value: "snorkelling", label: "Snorkelling" },
  { value: "training", label: "Training" },
  { value: "swim-throughs", label: "Swim-throughs" },
]

// The known values in a comma list, once each, in the order they were
// ticked, as a pill names the first.
const listOf = <T extends string>(text: string | undefined, of: Option<T>[]) =>
  (text?.split(",") ?? []).filter(
    (value, i, all): value is T =>
      of.some((option) => option.value === value) && all.indexOf(value) === i
  )

type Search = {
  types?: string
  depth?: string
  access?: string
  wind?: string
  swell?: string
  season?: string
  skills?: string
  good?: string
}

export function filtersOf(search: Search): SiteFilters {
  return {
    types: listOf(search.types, typeOptions),
    depth: decodeRange(search.depth, depthScale),
    access: listOf(search.access, accessOptions),
    // One wind and one swell, as a forecast gives one of each: an older
    // address with several keeps its first.
    wind: listOf(search.wind, compassOptions).slice(0, 1),
    swell: listOf(search.swell, compassOptions).slice(0, 1),
    season: listOf(search.season, seasonOptions),
    skills: listOf(search.skills, skillOptions),
    goodFor: listOf(search.good, goodForOptions),
  }
}

const joined = (list: string[] | undefined) => list?.join(",") || undefined

// The filters as the address keeps them, "?types=wreck,fresh&depth=18-30".
export const searchOf = (filters: SiteFilters) => ({
  types: joined(filters.types),
  depth: encodeRange(filters.depth),
  access: joined(filters.access),
  wind: joined(filters.wind),
  swell: joined(filters.swell),
  season: joined(filters.season),
  skills: joined(filters.skills),
  good: joined(filters.goodFor),
})

export const siteCount = (n: number) => `${n} ${n === 1 ? "site" : "sites"}`

// How many filters are set, for Clear.
export const filterCount = (filters: SiteFilters) =>
  Object.values(searchOf(filters)).filter(Boolean).length

// How many chips are ticked, for the Conditions pill and the phone's Filters
// pill, which holds the types but not the access, as it has a pill of its
// own there: two Good for chips are two, as they read.
export const conditionTicks = (filters: SiteFilters) =>
  (filters.wind?.length ?? 0) +
  (filters.swell?.length ?? 0) +
  (filters.season?.length ?? 0)
export const tagTicks = (filters: SiteFilters) =>
  conditionTicks(filters) +
  filters.types.length +
  (filters.skills?.length ?? 0) +
  (filters.goodFor?.length ?? 0)

// A site whose depth nobody knows can't be shown as inside a range. Its
// depth is in whole metres already; the top of the scale has no limit.
export function matchesSite(site: Site, filters: SiteFilters) {
  const { types, depth } = filters
  if (types.length && !types.includes(site.type)) return false
  const skills = filters.skills ?? []
  const tags = {
    ...filters,
    noSpecialSkills: skills.includes("basic"),
    avoid: skills.filter((skill): skill is Need => skill !== "basic"),
  }
  if (!matchesTags(site, tags)) return false
  if (!depth) return true
  if (site.depth === undefined || site.depth < depth.min) return false
  return depth.max >= depthScale.max || site.depth <= depth.max
}

export const filterSites = (filters: SiteFilters) =>
  filterCount(filters)
    ? sites.filter((site) => matchesSite(site, filters))
    : sites
