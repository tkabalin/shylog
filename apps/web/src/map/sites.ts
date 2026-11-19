import { mapPagePrefix, normaliseName } from "@shylog/core"

import raw from "./sites.geojson?raw"

import type { Compass, GoodFor, Need, Season } from "./tag-values"

// The dive site map's sites, from Wikivoyage (scripts/map/sites.ts writes
// the file). Imported as text, as Vite reads only .json as JSON, and part
// of the map's own chunk.

export type Area = "atlantic" | "false-bay" | "offshore" | "east" | "fresh"
export type SiteType = "reef" | "wreck" | "fresh"
// How you get in, as its page says: usually from the shore, by boat, or both,
// which counts a hard shore entry off a boat dive and says why it's hard.
export type Access = "shore" | "boat" | "both"
export type ShoreEntry = "long swim" | "climb"
export type { Compass, GoodFor, Need, Season } from "./tag-values"

export type Site = {
  id: string
  name: string
  area: Area
  type: SiteType
  // Whole metres; approximate where the page gives it only in words.
  depth?: number
  approximate?: true
  description?: string
  access?: Access
  shoreEntry?: ShoreEntry
  // Its page's tags, read by hand (scripts/map/page-tags.json): good winds,
  // swell exposure, best seasons, no special skills (said so, or fine for
  // entry-level divers or training), the skills asked for, what it's good for.
  wind?: Compass[]
  swell?: Compass[]
  season?: Season[]
  noSpecialSkills?: true
  needs?: Need[]
  goodFor?: GoodFor[]
  // The Wikivoyage page it comes from, and its section on a shared page;
  // none where the list links a page nobody has written.
  page?: string
  section?: string
  lon: number
  lat: number
}

// A named feature inside a site, as features.json holds them by site id.
export type SiteFeature = {
  name: string
  lon: number
  lat: number
  text?: string
}

type Feature = {
  geometry: { coordinates: [number, number] }
  properties: Omit<Site, "lon" | "lat">
}
const collection = JSON.parse(raw) as { fetched: string; features: Feature[] }

// When the snapshot was taken.
export const fetched = collection.fetched

export const sites: Site[] = collection.features.map(
  ({ geometry, properties }) => ({
    ...properties,
    lon: geometry.coordinates[0],
    lat: geometry.coordinates[1],
  })
)

export const siteById = new Map(sites.map((site) => [site.id, site]))

// A whole Wikivoyage page several sites share, for a log site linked to
// none of them in particular. `page` repeats its title, so the page text
// and its Wikivoyage link read it as they read a site.
export type Page = {
  id: string
  name: string
  page: string
  area: Area
  sites: Site[]
  // The deepest of its sites.
  depth?: number
  approximate?: true
}

// The generator gives every site on a page that page's slug before any "/",
// so a page's id comes from its sites'. Only shared pages count: a page with
// one site is that site.
const onPage = new Map<string, Site[]>()
for (const site of sites) {
  if (!site.page) continue
  const slug = site.id.split("/")[0]!
  const list = onPage.get(slug)
  if (list) list.push(site)
  else onPage.set(slug, [site])
}
export const pages: Page[] = [...onPage]
  .filter(([, shared]) => shared.length > 1)
  .map(([slug, shared]) => {
    const deepest = shared.reduce<Site | undefined>(
      (most, site) =>
        site.depth !== undefined &&
        (most?.depth === undefined || site.depth > most.depth)
          ? site
          : most,
      undefined
    )
    return {
      id: mapPagePrefix + slug,
      name: shared[0]!.page!,
      page: shared[0]!.page!,
      area: shared[0]!.area,
      sites: shared,
      ...(deepest && { depth: deepest.depth }),
      ...(deepest?.approximate && { approximate: true as const }),
    }
  })
export const pageById = new Map(pages.map((page) => [page.id, page]))

// The shared page a site is on, if it's on one.
export const pageOf = (site: Site) =>
  site.page ? pageById.get(mapPagePrefix + site.id.split("/")[0]) : undefined

// What a log site's link names on the map: a site, or a whole page.
export const mapLink = (id: string): Site | Page | undefined =>
  siteById.get(id) ?? pageById.get(id)

export const isPage = (link: Site | Page): link is Page => "sites" in link

// The list's search, among the sites the filters leave, as the Log's search
// narrows its filtered cards: names alone, ignoring case, accents,
// punctuation and spaces, so "millers" finds Miller's Point and "a frame"
// A-Frame.
const fold = (text: string) =>
  normaliseName(text).replace(/[^\p{L}\p{N}\p{M}]/gu, "")
const folded = new Map<string, string>()
function matchName<T extends { id: string; name: string }>(
  query: string,
  among: readonly T[]
) {
  const needle = fold(query)
  if (!needle) return among
  return among.filter((item) => {
    let name = folded.get(item.id)
    if (name === undefined) folded.set(item.id, (name = fold(item.name)))
    return name.includes(needle)
  })
}
export const searchSites = (query: string, among: readonly Site[] = sites) =>
  matchName(query, among)
export const searchPages = (query: string, among: readonly Page[] = pages) =>
  matchName(query, among)

// In the list's order, each clustering on its own.
export const areas: Record<Area, string> = {
  atlantic: "Atlantic coast",
  "false-bay": "False Bay coast",
  offshore: "Offshore False Bay",
  east: "East False Bay",
  fresh: "Fresh water",
}

export const siteTypes: Record<SiteType, string> = {
  reef: "Reef",
  wreck: "Wreck",
  fresh: "Fresh water",
}

// The site's page, at its section on a shared page, as Wikivoyage links it;
// a whole page's, at its top.
const wiki = (text: string) =>
  encodeURIComponent(text.replace(/ /g, "_")).replace(/%2F/g, "/")
export const wikivoyage = ({ page, section }: Pick<Site, "page" | "section">) =>
  page &&
  `https://en.wikivoyage.org/wiki/${wiki(
    `Diving the Cape Peninsula and False Bay/${page}`
  )}${section ? `#${wiki(section)}` : ""}`
