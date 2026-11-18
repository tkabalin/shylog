import sources from "./aerial.json"
import { inRing, type Point, type Ring } from "./zone-at"

// Whether Esri's imagery has its closest level here, the City of Cape
// Town's aerial photos. Even-odd within each source, whose holes are rings.
export const aerialAt = (point: Point) =>
  (sources as Ring[][]).some(
    (rings) => rings.filter((ring) => inRing(point, ring)).length % 2 === 1
  )
