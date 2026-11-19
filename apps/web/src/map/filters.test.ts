// @vitest-environment node
import { describe, expect, it } from "vitest"

import {
  conditionTicks,
  filterCount,
  filterSites,
  filtersOf,
  matchesSite,
  searchOf,
  tagTicks,
} from "./filters"
import { sites, type Site } from "./sites"

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
    ).toMatchObject({ types: ["wreck", "reef"], depth: { min: 18, max: 30 } })
  })

  it("reads the whole scale, or none, as no filter", () => {
    expect(filterCount(filtersOf({ depth: "0-40" }))).toBe(0)
    expect(filtersOf({})).toEqual({
      types: [],
      depth: undefined,
      access: [],
      wind: [],
      swell: [],
      season: [],
      skills: [],
      goodFor: [],
    })
  })

  it("keeps the known tags once each, in the order ticked, and one wind and swell", () => {
    expect(
      filtersOf({
        access: "boat,shore,cave",
        wind: "up,se,nw",
        swell: "sw,se",
        season: "winter,summer",
        skills: "fitness,basic",
        good: "night,nap",
      })
    ).toMatchObject({
      access: ["boat", "shore"],
      wind: ["se"],
      swell: ["sw"],
      season: ["winter", "summer"],
      skills: ["fitness", "basic"],
      goodFor: ["night"],
    })
  })
})

describe("tagTicks", () => {
  it("counts each ticked chip, not each group", () => {
    const filters = filtersOf({
      wind: "se",
      swell: "sw",
      good: "night,snorkelling",
      skills: "basic",
    })
    expect(tagTicks(filters)).toBe(5)
    expect(conditionTicks(filters)).toBe(2)
    // The phone's sheet holds the types; the access and depth have pills.
    expect(
      tagTicks(filtersOf({ types: "wreck", access: "shore", depth: "18-30" }))
    ).toBe(1)
  })
})

describe("searchOf", () => {
  it("writes back what filtersOf reads, and nothing for no filter", () => {
    const search = {
      types: "wreck,fresh",
      depth: "18-30",
      access: "shore",
      wind: "se",
      swell: "sw",
      season: "summer",
      skills: "basic,dsmb",
      good: "night,swim-throughs",
    }
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
