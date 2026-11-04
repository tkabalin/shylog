import { countryName } from "@shylog/core"

import type { Region, Site } from "@/data/db"

// A card's place is the site's region, or its country when it has none
// (D27); the detail names both.
export function cardPlace(site: Site | undefined, region: Region | undefined) {
  if (region) return region.name
  return site ? countryName(site.countryCode) : ""
}

export function fullPlace(site: Site | undefined, region: Region | undefined) {
  if (!site) return ""
  const country = countryName(site.countryCode)
  return region ? `${region.name}, ${country}` : country
}
