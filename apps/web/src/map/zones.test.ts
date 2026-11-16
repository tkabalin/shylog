// @vitest-environment node
import { describe, expect, it } from "vitest"

import { zoneRules } from "./zone-rules"
import zones from "./zones.json"

const fill = (id: string) =>
  zones.fills.features.find((zone) => zone.properties.id === id)!.geometry
    .coordinates[0]

describe("zones", () => {
  it("closes every fill", () => {
    for (const zone of zones.fills.features) {
      const ring = zone.geometry.coordinates[0]
      expect(ring.at(-1), zone.properties.id).toEqual(ring[0])
    }
  })

  it("meets Table Mountain's northern edge with Robben Island's southern", () => {
    const north = Math.max(...fill("table-mountain").map(([, lat]) => lat))
    const south = Math.min(...fill("robben-island").map(([, lat]) => lat))
    expect(south).toBe(north)
  })

  // The map names each zone along its edge, so it reads with no key.
  it("gives every zone its rules and names its edge", () => {
    for (const zone of zones.edges.features) {
      const { id } = zone.properties
      expect(zoneRules[id], id).toBeDefined()
      expect(zone.properties, id).toHaveProperty("label")
    }
    expect(Object.keys(zoneRules).sort()).toEqual(
      zones.edges.features.map((zone) => zone.properties.id).sort()
    )
  })
})
