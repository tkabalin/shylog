import { localValue } from "@/lib/local-value"

// The desktop card's width over the map, which a drag on its right edge
// sets: the list, a site and the rules share it, kept on this device.
export const narrowest = 360
export const widest = 960
// Until it's dragged, just wide enough for the filters on one row, measured
// in Chromium (558 px) and WebKit (556 px) with Geist loaded.
const opening = 560
export const clampWidth = (width: number) =>
  Math.min(widest, Math.max(narrowest, width))
export const cardWidth = localValue(
  "explore-card-width",
  (stored) => {
    const width = Number(stored ?? opening)
    return Number.isFinite(width) ? clampWidth(width) : opening
  },
  String
)
