import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { format, resolveConfig } from "prettier"

// Writes src/map/aerial.json, where Esri's World Imagery has its closest
// level (21), from aerial photos flown for the City of Cape Town and its
// neighbours; elsewhere the satellite stops at 19 or sooner. Run
// `pnpm --filter @shylog/web map:aerial` to refresh it.

const path = join(import.meta.dirname, "../../src/map/aerial.json")

// The basemap's box: Table Bay to Hangklip and out to the offshore wrecks.
const bbox = [17.9, -34.75, 19.3, -33.3]

// Layer 7 of the imagery's metadata service outlines the sources drawn at
// level 21. Esri simplifies them to about 10 m, as an edge off by that
// much only moves where the map lets you zoom.
const query = new URLSearchParams({
  geometry: bbox.join(","),
  geometryType: "esriGeometryEnvelope",
  inSR: "4326",
  spatialRel: "esriSpatialRelIntersects",
  outFields: "MaxMapLevel",
  returnGeometry: "true",
  outSR: "4326",
  maxAllowableOffset: "0.0001",
  geometryPrecision: "4",
  f: "json",
})
const response = await fetch(
  `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/7/query?${query}`
)
if (!response.ok) throw new Error(`${response.status} from Esri`)
const body = (await response.json()) as {
  error?: { message: string }
  exceededTransferLimit?: boolean
  features: {
    attributes: { MaxMapLevel: number }
    geometry: { rings: [number, number][][] }
  }[]
}
if (body.error) throw new Error(body.error.message)
if (body.exceededTransferLimit) throw new Error("Esri cut the list short")

// Each source's rings kept together, its outlines and holes, as sources
// overlap: an even-odd test across all of them would cancel out.
const sources = body.features
  .filter(({ attributes }) => attributes.MaxMapLevel >= 21)
  .map(({ geometry }) => geometry.rings.filter((ring) => ring.length >= 4))

writeFileSync(
  path,
  await format(JSON.stringify(sources), {
    ...(await resolveConfig(path)),
    parser: "json",
  })
)
console.log(`${sources.length} sources, ${sources.flat(2).length} points`)
