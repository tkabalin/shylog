import raw from "./sites.geojson?raw"

// The dive site map's sites, from Wikivoyage (scripts/map/sites.ts writes
// the file). Imported as text, as Vite reads only .json as JSON, and part
// of the map's own chunk.

export type Area = "atlantic" | "false-bay" | "offshore" | "east" | "fresh"
export type SiteType = "reef" | "wreck" | "fresh"
// How you get in, as its page says: usually from the shore, by boat, or both,
// which counts a hard shore entry off a boat dive and says why it's hard.
export type Access = "shore" | "boat" | "both"
export type ShoreEntry = "long swim" | "climb"

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
  // The Wikivoyage page it comes from, and its section on a shared page;
  // none where the list links a page nobody has written.
  page?: string
  section?: string
  lon: number
  lat: number
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

// The site's page, at its section on a shared page, as Wikivoyage links it.
const wiki = (text: string) =>
  encodeURIComponent(text.replace(/ /g, "_")).replace(/%2F/g, "/")
export const wikivoyage = ({ page, section }: Site) =>
  page &&
  `https://en.wikivoyage.org/wiki/${wiki(
    `Diving the Cape Peninsula and False Bay/${page}`
  )}${section ? `#${wiki(section)}` : ""}`
