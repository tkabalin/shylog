import { addProtocol } from "maplibre-gl"
import { Protocol } from "pmtiles"

import { extractUrl } from "./extract"
import type { BasemapSource } from "./style"

// The extract is one file the map reads by range requests, a tile at a
// time. The public site's build swaps this file for divesites/tiles.ts.
const protocol = new Protocol()
addProtocol("pmtiles", protocol.tile)

export const basemap: BasemapSource = { url: `pmtiles://${extractUrl}` }

// With no signal the extract can't load, and pmtiles would keep that
// failure, so it is dropped to be read again next time.
export const forgetFailure = () => {
  protocol.tiles.delete(extractUrl)
}
