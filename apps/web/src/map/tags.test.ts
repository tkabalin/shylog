// @vitest-environment node
import { describe, expect, it } from "vitest"

import type { Site } from "./sites"
import { matchesTags } from "./tags"

const site = (tags: Partial<Site>): Site => ({
  id: "test",
  name: "Test",
  area: "false-bay",
  type: "reef",
  lon: 18.4,
  lat: -34.2,
  ...tags,
})

describe("matchesTags", () => {
  const blouklip = site({
    wind: ["se"],
    swell: ["nw"],
    season: ["summer"],
    noSpecialSkills: true,
    needs: ["fitness"],
    goodFor: ["snorkelling"],
  })

  it("keeps a site good in any of the winds, and drops one silent on wind", () => {
    expect(matchesTags(blouklip, { wind: ["nw", "se"] })).toBe(true)
    expect(matchesTags(blouklip, { wind: ["nw"] })).toBe(false)
    expect(matchesTags(site({}), { wind: ["se"] })).toBe(false)
  })

  it("drops only a site exposed to the swell, not one silent on it", () => {
    expect(matchesTags(blouklip, { swell: ["sw", "nw"] })).toBe(false)
    expect(matchesTags(blouklip, { swell: ["sw"] })).toBe(true)
    expect(matchesTags(site({}), { swell: ["sw"] })).toBe(true)
  })

  it("drops a site that needs a skill to avoid, or one silent on skills", () => {
    expect(matchesTags(blouklip, { avoid: ["fitness"] })).toBe(false)
    expect(
      matchesTags(blouklip, { avoid: ["navigation"], noSpecialSkills: true })
    ).toBe(true)
    expect(matchesTags(site({}), { noSpecialSkills: true })).toBe(false)
    // A page silent on skills asks for none.
    expect(matchesTags(site({}), { avoid: ["fitness"] })).toBe(true)
  })

  it("matches a season and what it's good for on any of them", () => {
    expect(matchesTags(blouklip, { season: ["winter", "summer"] })).toBe(true)
    expect(matchesTags(blouklip, { season: ["winter"] })).toBe(false)
    expect(matchesTags(blouklip, { goodFor: ["night", "snorkelling"] })).toBe(
      true
    )
    expect(matchesTags(blouklip, { goodFor: ["night"] })).toBe(false)
  })

  it("counts a site dived both ways as a shore dive and a boat dive", () => {
    const both = site({ access: "both" })
    expect(matchesTags(both, { access: ["shore"] })).toBe(true)
    expect(matchesTags(both, { access: ["boat"] })).toBe(true)
    expect(matchesTags(site({ access: "boat" }), { access: ["shore"] })).toBe(
      false
    )
    // A site whose page doesn't say is neither.
    expect(matchesTags(site({}), { access: ["shore"] })).toBe(false)
  })

  it("leaves every site when nothing is picked", () => {
    expect(matchesTags(site({}), {})).toBe(true)
    expect(
      matchesTags(site({}), { wind: [], avoid: [], noSpecialSkills: false })
    ).toBe(true)
  })
})
