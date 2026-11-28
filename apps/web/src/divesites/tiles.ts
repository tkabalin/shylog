import tiles from "virtual:basemap-tiles"

import type { BasemapSource } from "@/map/style"

// The extract's tiles as files of their own, which the build unpacks
// (scripts/divesites.ts), since Cloudflare's static files answer a range
// request with the whole file. Swapped in for map/tiles.ts. Absolute, as
// MapLibre's worker fetches them; joined, as URL() would escape the braces.
export const basemap: BasemapSource = {
  tiles: [location.origin + tiles.path],
  bounds: tiles.bounds,
  minzoom: tiles.minzoom,
  maxzoom: tiles.maxzoom,
}

// A failed tile is a plain request, tried again when the map next asks.
export const forgetFailure = () => {}
