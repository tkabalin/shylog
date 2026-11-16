// @vitest-environment node
import { describe, expect, it } from "vitest"

import { strictness, zoneAt } from "./zone-at"
import zones from "./zones.json"

describe("zoneAt", () => {
  // An unranked kind would sort ahead of no diving.
  it("ranks every kind of zone the map shades", () => {
    for (const { properties } of zones.fills.features) {
      expect(strictness, properties.id).toContain(properties.kind)
    }
  })

  it("finds the zone a site lies in", () => {
    // A-Frame, in Boulders' no-take zone inside the Table Mountain MPA.
    expect(zoneAt([18.461033, -34.208067])).toEqual({
      id: "boulders",
      kind: "no-take",
    })
  })

  it("takes the strictest of the zones that overlap there", () => {
    // MV Afrikaner, in Robben Island's MPA and its no-diving zone.
    expect(zoneAt([18.344767, -33.833533])).toEqual({
      id: "robben-restricted",
      kind: "no-dive",
    })
  })

  it("finds none out at sea", () => {
    expect(zoneAt([18.0, -34.6])).toBeUndefined()
  })
})
