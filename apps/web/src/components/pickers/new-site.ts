import {
  defaultWaterType,
  mapPagePrefix,
  newId,
  normaliseName,
  placeKey,
  type CountryCode,
  type Id,
} from "@shylog/core"

import type { NewEntity } from "@/dive/form/values"
import type { Page as MapPage, Site as MapSite } from "@/map/sites"

import type { RegionRow, SiteRow } from "./site-sheet"

// A new site's region: one the country already has by that name, or a new
// one, which is created before the site.
export function regionFor(
  name: string,
  countryCode: CountryCode,
  regions: RegionRow[]
): { regionId: Id<"region">; entities: NewEntity[] } {
  const existing = regions.find(
    (region) =>
      region.countryCode === countryCode &&
      normaliseName(region.name) === normaliseName(name)
  )
  if (existing) return { regionId: existing.id as Id<"region">, entities: [] }
  const regionId = newId("region")
  return {
    regionId,
    entities: [{ kind: "region", id: regionId, fields: { name, countryCode } }],
  }
}

// Every site on Explore's map is round Cape Town.
const mapCountry: CountryCode = "ZA"

// A site on Explore's map, or a whole page several share.
export type MapLink = MapSite | MapPage
// Told apart by shape, as the map's own isPage would bring its data into
// the app's first load.
export const isMapPage = (link: MapLink): link is MapPage => "sites" in link

// The pages the picker offers whole. Not one with a site of its own name
// (Roman Rock's rock), which is the place by that name: its sheet on
// Explore leads to the whole page.
export const pickablePages = (pages: readonly MapPage[]) =>
  pages.filter(
    (page) =>
      !page.sites.some(
        (site) => normaliseName(site.name) === normaliseName(page.name)
      )
  )

// The log's site a map site or page already is: the one linked to it, or
// else one with its name in South Africa that links nowhere else, as eight
// of the map's pinnacles share four names. Keyed once, for the list's 409
// rows.
export function logSites(sites: SiteRow[]) {
  const linked = new Map<string, SiteRow>()
  const named = new Map<string, SiteRow>()
  for (const row of sites) {
    if (row.mapSite) linked.set(row.mapSite, row)
    named.set(placeKey(row.name, row.countryCode), row)
  }
  return (link: MapLink) => {
    const byName = named.get(placeKey(link.name, mapCountry))
    // A site with its page's name ("Roman Rock") is also the log's one by
    // that name linked to the whole page, as the server can link it so.
    const ownPage =
      !isMapPage(link) &&
      byName?.mapSite === mapPagePrefix + link.id.split("/")[0]
    return (
      linked.get(link.id) ??
      (byName && (!byName.mapSite || ownPage) ? byName : undefined)
    )
  }
}

// A new site from one on Explore's map, filled in from what the map knows:
// its region is the map's area, but the Fresh water area is only Blue Rock
// Quarry's page, a place where "Fresh water" names none, so it takes that.
// Where the log already has the name for another map site, the page tells
// them apart ("Central Pinnacle, Josh's Reef"), as a name can't be taken
// twice; a whole page's, held by a site linked to one of its own, becomes
// "Castle Rocks, all sites". A whole page is linked as a site is.
export function fromMapSite(
  link: MapLink,
  area: string,
  regions: RegionRow[],
  sites: SiteRow[]
): { id: Id<"site">; entities: NewEntity[] } {
  const region = link.area === "fresh" && link.page ? link.page : area
  const { regionId, entities } = regionFor(region, mapCountry, regions)
  const fresh = isMapPage(link) ? link.area === "fresh" : link.type === "fresh"
  const bodyOfWater = fresh ? "lakeQuarry" : "oceanSea"
  const taken = sites.some(
    (row) =>
      placeKey(row.name, row.countryCode) === placeKey(link.name, mapCountry)
  )
  const name = !taken
    ? link.name
    : isMapPage(link)
      ? `${link.name}, all sites`
      : link.page
        ? `${link.name}, ${link.page}`
        : link.name
  const id = newId("site")
  return {
    id,
    entities: [
      ...entities,
      {
        kind: "site",
        id,
        fields: {
          name,
          countryCode: mapCountry,
          regionId,
          bodyOfWater,
          waterType: defaultWaterType(bodyOfWater),
          mapSite: link.id,
        },
      },
    ],
  }
}
