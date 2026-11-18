import zones from "./zones.json"

// The zone a point lies in, from the same shapes the map shades, where
// several overlap the one whose rule binds most: no diving, then shore dives
// only, no snorkelling, a no-take zone, and last the marine protected area.
export const strictness = [
  "no-dive",
  "shore-only",
  "no-snorkel",
  "no-take",
  "mpa",
]

export type Point = [lon: number, lat: number]
export type Ring = Point[]

// Even-odd: a ray from the point crosses the ring's edge an odd number of
// times from inside.
export function inRing([x, y]: Point, ring: Ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

const fills = zones.fills.features.map(({ geometry, properties }) => ({
  id: properties.id,
  kind: properties.kind,
  rank: strictness.indexOf(properties.kind),
  polygons: (geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates) as unknown as Ring[][],
}))

export function zoneAt(point: Point) {
  return fills
    .filter(({ polygons }) =>
      polygons.some(
        ([outer, ...holes]) =>
          inRing(point, outer) && !holes.some((hole) => inRing(point, hole))
      )
    )
    .sort((a, b) => a.rank - b.rank)
    .map(({ id, kind }) => ({ id, kind }))[0]
}
