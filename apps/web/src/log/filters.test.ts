import { describe, expect, it } from "vitest"

import type { Dive } from "@/data/db"
import type { LogView } from "@/data/log"

import {
  headerFigures,
  inDepthRange,
  inDurationRange,
  matchesFilters,
  matchesSearch,
  monthGroups,
} from "./filters"

const dive = (overrides: Partial<Dive>) =>
  ({
    id: "dive-a",
    startTime: "2026-07-22T08:12:19",
    siteId: "site-a",
    duration: 2500,
    maxDepth: 32.66,
    ignored: false,
    notableAnimals: null,
    notes: null,
    ...overrides,
  }) as Dive

const log = {
  sites: new Map([
    ["site-a", { id: "site-a", name: "Two Mile Reef", regionId: "region-s" }],
    ["site-b", { id: "site-b", name: "A-Frame", regionId: null }],
  ]),
  people: new Map([["person-l", { id: "person-l", name: "Lérato Mokoena" }]]),
  links: new Map([
    ["dive-a", { buddies: ["person-l"], professionals: [], tags: ["drift"] }],
  ]),
} as unknown as LogView

describe("depth range", () => {
  it("rounds the dive to whole metres, then includes both bounds", () => {
    const range = { min: 18, max: 30 }
    expect(inDepthRange(18, range)).toBe(true)
    expect(inDepthRange(30, range)).toBe(true)
    // Shown as 18.0 m and 30.4 m, both read as whole metres in range.
    expect(inDepthRange(17.96, range)).toBe(true)
    expect(inDepthRange(30.4, range)).toBe(true)
    expect(inDepthRange(17.499, range)).toBe(false)
    expect(inDepthRange(30.5, range)).toBe(false)
  })

  it("keeps everything deeper when the top handle is at > 40 m", () => {
    expect(inDepthRange(56.2, { min: 30, max: 40 })).toBe(true)
    expect(inDepthRange(56.2, { min: 30, max: 39 })).toBe(false)
  })
})

describe("duration range", () => {
  it("rounds the dive to whole minutes, then includes both bounds", () => {
    const range = { min: 30, max: 45 }
    expect(inDurationRange(1800, range)).toBe(true)
    expect(inDurationRange(2700, range)).toBe(true)
    // 29:40 and 45:20 show as 30 and 45 min.
    expect(inDurationRange(1780, range)).toBe(true)
    expect(inDurationRange(2720, range)).toBe(true)
    expect(inDurationRange(1769, range)).toBe(false)
    expect(inDurationRange(2730, range)).toBe(false)
  })

  it("keeps everything longer when the top handle is at > 90 min", () => {
    expect(inDurationRange(5520, { min: 60, max: 90 })).toBe(true)
    expect(inDurationRange(5520, { min: 60, max: 85 })).toBe(false)
  })

  it("drops a dive with no duration only when the range starts above 0", () => {
    expect(inDurationRange(null, { min: 0, max: 30 })).toBe(true)
    expect(inDurationRange(0, { min: 0, max: 90 })).toBe(true)
    expect(inDurationRange(null, { min: 5, max: 90 })).toBe(false)
  })
})

describe("matchesFilters", () => {
  it("filters by year, tag, region and the two ranges together", () => {
    const a = dive({})
    expect(matchesFilters(a, { year: "2026" }, log)).toBe(true)
    expect(matchesFilters(a, { year: "2025" }, log)).toBe(false)
    expect(matchesFilters(a, { tag: "drift" }, log)).toBe(true)
    expect(matchesFilters(a, { tag: "night" }, log)).toBe(false)
    expect(matchesFilters(a, { region: "region-s" }, log)).toBe(true)
    expect(
      matchesFilters(dive({ siteId: "site-b" }), { region: "region-s" }, log)
    ).toBe(false)
    expect(
      matchesFilters(
        a,
        { depth: { min: 30, max: 40 }, duration: { min: 40, max: 45 } },
        log
      )
    ).toBe(true)
    expect(matchesFilters(a, { depth: { min: 0, max: 30 } }, log)).toBe(false)
  })
})

describe("matchesSearch", () => {
  it("searches site, buddies, animals and notes, ignoring case and accents", () => {
    expect(matchesSearch(dive({}), "two mile", log)).toBe(true)
    expect(matchesSearch(dive({}), "lerato", log)).toBe(true)
    expect(
      matchesSearch(dive({ notableAnimals: "Potato bass" }), "POTATO", log)
    ).toBe(true)
    expect(
      matchesSearch(dive({ notes: "Strong drift north" }), "drift", log)
    ).toBe(true)
    expect(matchesSearch(dive({}), "turtle", log)).toBe(false)
    expect(matchesSearch(dive({}), "  ", log)).toBe(true)
  })
})

describe("header figures and month groups", () => {
  const dives = [
    dive({
      id: "d1",
      startTime: "2026-10-10T09:00:00",
      duration: 2460,
      maxDepth: 18.6,
    }),
    dive({
      id: "d2",
      startTime: "2026-07-25T09:00:00",
      duration: 2640,
      maxDepth: 32.7,
    }),
    dive({
      id: "d3",
      startTime: "2026-07-24T09:00:00",
      duration: 3600,
      maxDepth: 40,
      ignored: true,
    }),
  ]

  it("leaves ignored dives out of the counts", () => {
    expect(headerFigures(dives)).toEqual({
      count: 2,
      seconds: 5100,
      deepest: 32.7,
    })
    expect(headerFigures([])).toEqual({ count: 0, seconds: 0, deepest: null })
  })

  it("groups by month, newest first, still listing ignored dives", () => {
    const groups = monthGroups(dives)
    expect(
      groups.map(({ label, count, dives }) => [label, count, dives.length])
    ).toEqual([
      ["October 2026", 1, 1],
      ["July 2026", 1, 2],
    ])
  })
})
