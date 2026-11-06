import { underwater } from "@shylog/core"
import { describe, expect, it } from "vitest"

import {
  byFixtureNumber,
  fixtureStarts,
  zoopXml,
} from "../../test/uddf-fixtures.ts"
import { readUddf } from "../uddf/reader.ts"
import { leftOut } from "./freedive.ts"

// The Zoop Novo export has the D4i export's elements and placeholders, so
// the same reader and rules cover it with none of its own.
describe("the Zoop Novo export", () => {
  const dives = readUddf(zoopXml)
  const starts = fixtureStarts(zoopXml)
  const fixture = byFixtureNumber(zoopXml, dives)
  const events = dives.flatMap((dive) => dive.events)

  it("reads all 61 dives from the Zoop Novo", () => {
    expect(dives).toHaveLength(61)
    expect(new Set(dives.map((dive) => dive.computerModel))).toEqual(
      new Set(["Suunto Zoop Novo"])
    )
    // Every dive is on air.
    expect(dives.every((dive) => dive.oxygen == null)).toBe(true)
  })

  it("finds the 30 freedives of 8 December 2025", () => {
    const freedives = dives.filter((dive) => leftOut(dive) === "freedive")
    expect(freedives.map((dive) => dive.startTime)).toEqual(
      Array.from({ length: 30 }, (_, i) => starts.get(i + 8))
    )
    expect(freedives.every((d) => d.startTime.startsWith("2025-12-08"))).toBe(
      true
    )
    expect(Math.min(...freedives.map((dive) => dive.duration))).toBe(4)
    expect(Math.max(...freedives.map((dive) => dive.duration))).toBe(26)
  })

  it("leaves out dives 42 and 54 as under a minute, with no closing surfacing", () => {
    const short = dives.filter((dive) => leftOut(dive) === "short")
    expect(short.map((dive) => dive.startTime)).toEqual([
      starts.get(42),
      starts.get(54),
    ])
    expect(short.map((dive) => dive.duration)).toEqual([20, 4])
    for (const dive of short)
      expect(dive.events).toEqual([{ type: "surface", start: 0, end: null }])
  })

  it("gives dive 54 no average depth: one sample at 0 s has none", () => {
    const dive = fixture(54)
    expect(dive.samples).toHaveLength(1)
    expect(dive.averageDepth).toBeNull()
    // What the derived pass falls back to, as Subsurface's
    // fixup_dc_duration does.
    expect(underwater(dive.samples)).toBeNull()
  })

  it("pairs 8 ascent alarms and keeps 140 surfacings", () => {
    const ascents = events.filter((event) => event.type === "ascent")
    expect(ascents).toHaveLength(8)
    expect(ascents.every((event) => event.end != null)).toBe(true)
    expect(
      fixture(61).events.filter((event) => event.type === "ascent")[1]
    ).toEqual({ type: "ascent", start: 3556, end: 3571 })
    expect(events.filter((event) => event.type === "surface")).toHaveLength(140)
  })

  it("merges dive 61's repeated times", () => {
    const raw = /<divenumber>61<\/divenumber>[\s\S]*?<\/dive>/.exec(zoopXml)![0]
    const times = fixture(61).samples.map((sample) => sample.time)
    expect(new Set(times).size).toBe(times.length)
    expect(times.length).toBeLessThan(raw.split("<waypoint>").length - 1)
  })

  it("keeps dive 53's samples past its duration", () => {
    const dive = fixture(53)
    expect(dive.duration).toBe(160)
    expect(dive.samples.at(-1)!.time).toBe(340)
  })

  it("takes dive 15's max depth from greatestdepth, below its deepest sample", () => {
    const dive = fixture(15)
    expect(dive.maxDepth).toBe(8.15)
    expect(Math.max(...dive.samples.map((sample) => sample.depth))).toBe(7.64)
  })

  it("reads none of Subsurface's placeholders as data", () => {
    for (const dive of dives) {
      expect(dive.weight).toBeNull()
      expect(dive.notes).toBeNull()
    }
  })
})
