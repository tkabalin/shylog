// @vitest-environment node
import { describe, expect, it } from "vitest"

import { aerialAt } from "./aerial"
import { sites } from "./sites"

describe("aerialAt", () => {
  it("finds the City's aerial photos inshore", () => {
    // Simon's Town's harbour, sharp at Esri's level 21.
    expect(aerialAt([18.4335, -34.1915])).toBe(true)
  })

  it("leaves out where the imagery stops sooner", () => {
    // Rooi-Els, beyond the City's edge, whose tiles stop at level 18.
    expect(aerialAt([18.817, -34.298])).toBe(false)
    // Offshore of Sea Point, where only the satellite reaches.
    expect(aerialAt([18.354, -33.905])).toBe(false)
  })

  // 75 of 409 when Esri was asked site by site on 18 November 2026; a
  // sharp drop would mean a source's holes cancelled its outline.
  it("covers the inshore sites", () => {
    const covered = sites.filter(({ lon, lat }) => aerialAt([lon, lat]))
    expect(covered.length).toBeGreaterThan(60)
  })
})
