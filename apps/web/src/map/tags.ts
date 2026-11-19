import type { Site } from "./sites"
import {
  compass,
  type Compass,
  type GoodFor,
  type Need,
  type Season,
} from "./tag-values"

export { compass, goodFors, needs, seasons } from "./tag-values"

export type Way = "shore" | "boat"

// The ways in and page tags a search picks from, shared by Explore's
// filters and the MCP search so the two find the same sites.
export type TagFilters = {
  // Any of these; a site dived both ways is a shore dive and a boat dive.
  access?: Way[]
  // The dive day's wind: sites good in or after any of these or a point either
  // side, as a page's "westerly" covers a north-westerly too.
  wind?: Compass[]
  // The dive day's swell: sites exposed to none of these.
  swell?: Compass[]
  season?: Season[]
  noSpecialSkills?: boolean
  // Skills the diver would rather not need: sites asking for none of them.
  avoid?: Need[]
  // Any of these, as the other multiple choice filters are.
  goodFor?: GoodFor[]
}

export const ways: Way[] = ["shore", "boat"]

// A point and its neighbours either side, clockwise.
export const around = (point: Compass) => {
  const i = compass.indexOf(point)
  return [compass[(i + 7) % 8], point, compass[(i + 1) % 8]]
}

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
  if (wind?.length && !some(site.wind, wind.flatMap(around))) return false
  if (swell?.length && some(site.swell, swell)) return false
  if (season?.length && !some(site.season, season)) return false
  if (noSpecialSkills && !site.noSpecialSkills) return false
  if (avoid?.length && some(site.needs, avoid)) return false
  return !goodFor?.length || some(site.goodFor, goodFor)
}
