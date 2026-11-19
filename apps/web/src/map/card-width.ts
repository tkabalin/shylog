import { localValue } from "@/lib/local-value"

// The desktop card's width over the map, which a drag on its right edge
// sets: the list, a site and the rules share it, kept on this device.
export const narrowest = 360
export const widest = 640
export const clampWidth = (width: number) =>
  Math.min(widest, Math.max(narrowest, width))
export const cardWidth = localValue(
  "explore-card-width",
  (stored) => {
    const width = Number(stored ?? narrowest)
    return Number.isFinite(width) ? clampWidth(width) : narrowest
  },
  String
)
