// @vitest-environment node
import { describe, expect, it } from "vitest"

import { divingLimit, searchSites, zoneNote } from "./find"
import { siteById, sites } from "./sites"

const site = (id: string) => siteById.get(id)!

describe("searchSites", () => {
  const names = (query: string) => searchSites(query).map(({ name }) => name)

  it("ignores case, accents, punctuation and spaces", () => {
    expect(names("millers point")).toContain("Miller's Point slipway")
    expect(names("a frame")).toContain("A-Frame")
    expect(names("SAO JOSE")).toContain("São José Paquete d' Africa")
  })

  it("searches only the sites the filters leave", () => {
    const wrecks = sites.filter(({ type }) => type === "wreck")
    const found = searchSites("rock", wrecks)
    expect(found.length).toBeGreaterThan(0)
    expect(found.every(({ type }) => type === "wreck")).toBe(true)
  })

  it("finds every site for an empty search", () => {
    expect(searchSites("  ")).toBe(sites)
  })
})

describe("divingLimit", () => {
  it("names who may dive where the strictest zone limits it", () => {
    expect(divingLimit(site("anvil-rock/anvil-rock-caves"))).toBe("no-diving")
    expect(divingLimit(site("bordjiesrif"))).toBe("shore-only")
    expect(divingLimit(site("blomvlei"))).toBe("business-only")
    expect(divingLimit(site("a-frame"))).toBeUndefined()
  })
})

describe("zoneNote", () => {
  it("names only zones that limit who may dive", () => {
    expect(zoneNote(site("anvil-rock/anvil-rock-caves"))).toEqual({
      text: "No diving",
      warn: true,
    })
    expect(zoneNote(site("bordjiesrif"))).toEqual({ text: "Shore dives only" })
    expect(zoneNote(site("blomvlei"))).toEqual({ text: "Dive business only" })
    // In Boulders' no-take zone, where diving is free.
    expect(zoneNote(site("a-frame"))).toBeUndefined()
  })
})
