import type { Site } from "./sites"
import type { Compass, GoodFor, Need, Season } from "./tag-values"

export { compass, goodFors, needs, seasons } from "./tag-values"

export type Way = "shore" | "boat"

// The ways in and page tags a search picks from, shared by Explore's
// filters and the MCP search so the two find the same sites.
export type TagFilters = {
  // Any of these; a site dived both ways is a shore dive and a boat dive.
  access?: Way[]
  // Today's wind: sites good in or after any of these.
  wind?: Compass[]
  // Today's swell: sites exposed to none of these.
  swell?: Compass[]
  season?: Season[]
  noSpecialSkills?: boolean
  // Skills the diver would rather not need: sites asking for none of them.
  avoid?: Need[]
  // Any of these, as the other multiple choice filters are.
  goodFor?: GoodFor[]
}

export const ways: Way[] = ["shore", "boat"]

const some = <T>(of: T[] | undefined, picked: T[]) =>
  picked.some((each) => of?.includes(each))

export function matchesTags(site: Site, filters: TagFilters) {
  const { access, wind, swell, season, noSpecialSkills, avoid, goodFor } =
    filters
  if (
    access?.length &&
    !access.some((way) => site.access === way || site.access === "both")
  )
    return false
  if (wind?.length && !some(site.wind, wind)) return false
  if (swell?.length && some(site.swell, swell)) return false
  if (season?.length && !some(site.season, season)) return false
  if (noSpecialSkills && !site.noSpecialSkills) return false
  if (avoid?.length && some(site.needs, avoid)) return false
  return !goodFor?.length || some(site.goodFor, goodFor)
}
