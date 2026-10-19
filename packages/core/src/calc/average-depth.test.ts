import { describe, expect, it } from "vitest"

import { fixtureDive, fixtureScubaDives } from "../../test/fixture.ts"
import { subsurfaceFigures } from "../../test/subsurface.ts"
import { underwater } from "./average-depth.ts"
import type { Sample } from "./samples.ts"

const at = (time: number, depth: number): Sample => ({
  time,
  depth,
  temperature: null,
  pressure: null,
})

describe("fixture dives", () => {
  it("dive 36 is within 0.05 m of its exported averagedepth", () => {
    const dive = fixtureDive(36)
    const result = underwater(dive.samples)!
    expect(dive.averageDepth).toBe(10.396)
    expect(result.averageDepth).toBe(10.384)
    expect(Math.abs(result.averageDepth - dive.averageDepth)).toBeLessThan(0.05)
  })

  it("matches Subsurface's fixup_dc_duration on every scuba dive", () => {
    for (const dive of fixtureScubaDives()) {
      const expected = subsurfaceFigures.find((f) => f.number === dive.number)!
      expect(underwater(dive.samples), `dive ${dive.number}`).toEqual({
        duration: expected.underwater,
        averageDepth: expected.averageDepth / 1000,
      })
    }
  })
})

describe("underwater", () => {
  it("weights depth by time", () => {
    // 10 m for 60 s and 20 m for 60 s, joined by straight lines.
    const result = underwater([at(0, 10), at(60, 10), at(60, 20), at(120, 20)])
    expect(result).toEqual({ duration: 120, averageDepth: 15 })
  })

  it("leaves out segments with both ends at the surface", () => {
    const result = underwater([
      at(0, 0),
      at(60, 10),
      at(120, 0),
      at(600, 0),
      at(660, 10),
      at(720, 0),
    ])
    // Two 120 s dips averaging 5 m; the 480 s at the surface is left out.
    expect(result).toEqual({ duration: 240, averageDepth: 5 })
  })

  it("counts a segment with one end below the surface", () => {
    expect(underwater([at(0, 0), at(10, 1)])).toEqual({
      duration: 10,
      averageDepth: 0.5,
    })
  })

  it("counts exactly 0.75 m as at the surface, as fixup_dc_duration does", () => {
    expect(underwater([at(0, 0.75), at(10, 0.75)])).toBeNull()
    expect(underwater([at(0, 0.751), at(10, 0.75)])).toEqual({
      duration: 10,
      averageDepth: 0.751,
    })
  })

  it("starts from the surface at 0 s", () => {
    // The first sample at 20 s, 10 m: the 20 s before it count at 5 m.
    expect(underwater([at(20, 10), at(40, 10)])).toEqual({
      duration: 40,
      averageDepth: 7.5,
    })
  })

  it("truncates each segment's depth-time to whole mm·s", () => {
    // 1 s between 1000 and 1001 mm is 1000.5 mm·s, kept as 1000.
    expect(underwater([at(0, 1), at(1, 1.001)])).toEqual({
      duration: 1,
      averageDepth: 1,
    })
  })

  it("rounds the mean to the whole mm, halves up", () => {
    // 2001 mm·s over 2 s is 1000.5 mm.
    expect(underwater([at(0, 1), at(2, 1.001)])).toEqual({
      duration: 2,
      averageDepth: 1.001,
    })
  })

  it("is null without samples or with every sample at the surface", () => {
    expect(underwater([])).toBeNull()
    expect(underwater([at(0, 0), at(60, 0.5), at(120, 0)])).toBeNull()
  })

  it("skips a sample with a negative depth, as fixup_dc_duration does", () => {
    // The segment runs from 60 s to 120 s, past the skipped sample.
    expect(
      underwater([at(0, 10), at(60, 10), at(90, -0.1), at(120, 10)])
    ).toEqual({ duration: 120, averageDepth: 10 })
  })

  it("adds nothing for repeated times", () => {
    const samples = [at(0, 5), at(10, 5), at(10, 5), at(20, 5)]
    expect(underwater(samples)).toEqual(
      underwater([at(0, 5), at(10, 5), at(20, 5)])
    )
  })
})
