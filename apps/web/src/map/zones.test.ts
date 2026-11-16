// @vitest-environment node
import { describe, expect, it } from "vitest"

import { zoneRules } from "./zone-rules"
import zones from "./zones.json"

const zone = (id: string) =>
  zones.fills.features.find((each) => each.properties.id === id)!.geometry
const rings = ({ type, coordinates }: ReturnType<typeof zone>) =>
  (type === "Polygon" ? [coordinates] : coordinates).flat() as number[][][]

describe("zones", () => {
  it("closes every fill", () => {
    for (const { geometry, properties } of zones.fills.features) {
      for (const ring of rings(geometry)) {
        expect(ring.at(-1), properties.id).toEqual(ring[0])
      }
    }
  })

  it("meets Table Mountain's northern edge with Robben Island's southern", () => {
    const north = Math.max(
      ...rings(zone("table-mountain"))[0].map(([, lat]) => lat)
    )
    const south = Math.min(
      ...rings(zone("robben-island"))[0].map(([, lat]) => lat)
    )
    expect(south).toBe(north)
  })

  it("keeps the Cape Point bands south of Venus Pool and Olifantsbos", () => {
    for (const id of ["cape-point-no-dive", "cape-point-shore-only"]) {
      for (const [lon, lat] of rings(zone(id)).flat()) {
        expect(lat, id).toBeLessThanOrEqual(
          lon <= 18.43 ? -34.271667 : -34.295733
        )
      }
    }
  })

  // The map names each zone along its edge, so it reads with no key.
  it("names every zone's rule, and every edge", () => {
    expect(Object.keys(zoneRules).sort()).toEqual(
      zones.fills.features.map((each) => each.properties.id).sort()
    )
    for (const { properties } of zones.edges.features) {
      // The shore band's dotted ends close an area its words already name.
      if (properties.kind === "shore-only-end") continue
      expect(properties, properties.id).toHaveProperty("label")
    }
  })
})
