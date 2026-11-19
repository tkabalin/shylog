import {
  defaultWaterType,
  newId,
  normaliseName,
  placeKey,
  type CountryCode,
  type Id,
} from "@shylog/core"

import type { NewEntity } from "@/dive/form/values"
import type { Site as MapSite } from "@/map/sites"

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

// The log's site a map site already is: the one linked to it, or else one
// with its name in South Africa that links nowhere else, as eight of the
// map's pinnacles share four names. Keyed once, for the list's 409 rows.
export function logSites(sites: SiteRow[]) {
  const linked = new Map<string, SiteRow>()
  const named = new Map<string, SiteRow>()
  for (const row of sites) {
    if (row.mapSite) linked.set(row.mapSite, row)
    named.set(placeKey(row.name, row.countryCode), row)
  }
  return (site: MapSite) => {
    const byName = named.get(placeKey(site.name, mapCountry))
    return (
      linked.get(site.id) ?? (byName && !byName.mapSite ? byName : undefined)
    )
  }
}

// A new site from one on Explore's map, filled in from what the map knows:
// its region is the map's area, but the Fresh water area is only Blue Rock
// Quarry's page, a place where "Fresh water" names none, so it takes that.
// Where the log already has the name for another map site, the page tells
// them apart ("Central Pinnacle, Josh's Reef"), as a name can't be taken twice.
export function fromMapSite(
  site: MapSite,
  area: string,
  regions: RegionRow[],
  sites: SiteRow[]
): { id: Id<"site">; entities: NewEntity[] } {
  const region = site.area === "fresh" && site.page ? site.page : area
  const { regionId, entities } = regionFor(region, mapCountry, regions)
  const bodyOfWater = site.type === "fresh" ? "lakeQuarry" : "oceanSea"
  const taken = sites.some(
    (row) =>
      placeKey(row.name, row.countryCode) === placeKey(site.name, mapCountry)
  )
  const id = newId("site")
  return {
    id,
    entities: [
      ...entities,
      {
        kind: "site",
        id,
        fields: {
          name: taken && site.page ? `${site.name}, ${site.page}` : site.name,
          countryCode: mapCountry,
          regionId,
          bodyOfWater,
          waterType: defaultWaterType(bodyOfWater),
          mapSite: site.id,
        },
      },
    ],
  }
}
