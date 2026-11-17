// @vitest-environment node
import { describe, expect, it } from "vitest"

import {
  filterSites,
  filtersOf,
  matchesSite,
  searchOf,
  searchSites,
  zoneNote,
} from "./filters"
import { siteById, sites, type Site } from "./sites"

const site = (id: string) => siteById.get(id)!
const reef = (depth?: number): Site => ({
  id: "test",
  name: "Test",
  area: "atlantic",
  type: "reef",
  depth,
  lon: 18.4,
  lat: -34,
})

describe("filtersOf", () => {
  it("keeps the known types once each, and a range inside the scale", () => {
    expect(
      filtersOf({ types: "wreck,reef,wreck,cave", depth: "18-30" })
    ).toEqual({ types: ["wreck", "reef"], depth: { min: 18, max: 30 } })
  })

  it("reads the whole scale, or none, as no filter", () => {
    expect(filtersOf({ depth: "0-40" })).toEqual({
      types: [],
      depth: undefined,
    })
    expect(filtersOf({})).toEqual({ types: [], depth: undefined })
  })
})

describe("searchOf", () => {
  it("writes back what filtersOf reads, and nothing for no filter", () => {
    const search = { types: "wreck,fresh", depth: "18-30" }
    expect(searchOf(filtersOf(search))).toEqual(search)
    expect(searchOf({ types: [] })).toEqual({
      types: undefined,
      depth: undefined,
    })
  })
})

describe("matchesSite", () => {
  it("shows a site of any ticked type", () => {
    expect(matchesSite(reef(), { types: ["wreck"] })).toBe(false)
    expect(matchesSite(reef(), { types: ["wreck", "reef"] })).toBe(true)
  })

  it("takes bounds as inclusive, with no limit at the scale's top", () => {
    const range = { min: 18, max: 30 }
    expect(matchesSite(reef(18), { types: [], depth: range })).toBe(true)
    expect(matchesSite(reef(30), { types: [], depth: range })).toBe(true)
    expect(matchesSite(reef(31), { types: [], depth: range })).toBe(false)
    expect(
      matchesSite(reef(60), { types: [], depth: { min: 18, max: 40 } })
    ).toBe(true)
  })

  // Nobody knows its depth, so it can't be shown as inside a range.
  it("hides a site with no depth only while a range is set", () => {
    expect(matchesSite(reef(), { types: [] })).toBe(true)
    expect(matchesSite(reef(), { types: [], depth: { min: 0, max: 30 } })).toBe(
      false
    )
  })

  it("leaves every site when nothing is set", () => {
    expect(filterSites({ types: [] })).toBe(sites)
  })
})

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
