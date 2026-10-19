import { describe, expect, it } from "vitest"

import { fixtureDive, fixtureScubaDives } from "../../test/fixture.ts"
import { subsurfaceFigures } from "../../test/subsurface.ts"
import {
  diveEnd,
  lastUnderwaterSample,
  mergeDuplicateSamples,
  type Sample,
} from "./samples.ts"

const at = (
  time: number,
  depth: number,
  temperature: number | null = null,
  pressure: number | null = null
): Sample => ({ time, depth, temperature, pressure })

describe("mergeDuplicateSamples", () => {
  it("merges fixture dive 3's five repeated times to one sample each", () => {
    const { samples } = fixtureDive(3)
    const times = samples.map((sample) => sample.time)
    expect(times.length - new Set(times).size).toBe(5)
    const merged = mergeDuplicateSamples(samples)
    expect(merged).toHaveLength(new Set(times).size)
    expect(new Set(merged.map((sample) => sample.time)).size).toBe(
      merged.length
    )
    expect(merged.find((sample) => sample.time === 1846)?.depth).toBe(3.35)
  })

  it("leaves no repeated time in any fixture dive", () => {
    for (const dive of fixtureScubaDives()) {
      const merged = mergeDuplicateSamples(dive.samples)
      for (let i = 1; i < merged.length; i++) {
        expect(merged[i].time, `dive ${dive.number}`).toBeGreaterThan(
          merged[i - 1].time
        )
      }
    }
  })

  it("keeps the first sample, filling its gaps from the repeats", () => {
    expect(
      mergeDuplicateSamples([
        at(0, 1),
        at(10, 5, null, null),
        at(10, 5.2, 21.5, null),
        at(10, 5.4, 22, 180),
        at(20, 6),
      ])
    ).toEqual([at(0, 1), at(10, 5, 21.5, 180), at(20, 6)])
  })

  it("keeps the first sample's own values over a repeat's", () => {
    expect(
      mergeDuplicateSamples([at(10, 5, 20, 200), at(10, 5, 19, 190)])
    ).toEqual([at(10, 5, 20, 200)])
  })

  it("does not change the samples passed in", () => {
    const samples = [at(10, 5), at(10, 5, 20)]
    mergeDuplicateSamples(samples)
    expect(samples).toEqual([at(10, 5), at(10, 5, 20)])
  })

  it("passes samples without repeats through", () => {
    const samples = [at(0, 1), at(10, 2), at(20, 3)]
    expect(mergeDuplicateSamples(samples)).toEqual(samples)
    expect(mergeDuplicateSamples([])).toEqual([])
  })
})

describe("dive end", () => {
  it("fixture dive 6 ends at its last sample below 0.75 m", () => {
    const dive = fixtureDive(6)
    expect(dive.duration).toBe(180)
    expect(dive.samples.at(-1)?.time).toBe(502)
    expect(lastUnderwaterSample(dive.samples)?.time).toBe(440)
    expect(diveEnd(dive.duration, dive.samples)).toBe(440)
  })

  it("matches Subsurface's dc_totaltime on every scuba dive", () => {
    for (const dive of fixtureScubaDives()) {
      const expected = subsurfaceFigures.find((f) => f.number === dive.number)!
      expect(
        lastUnderwaterSample(dive.samples)?.time,
        `dive ${dive.number}`
      ).toBe(expected.lastUnderwater)
      expect(diveEnd(dive.duration, dive.samples)).toBe(
        Math.max(dive.duration, expected.lastUnderwater)
      )
    }
  })

  it("is the duration when that is later", () => {
    expect(diveEnd(600, [at(0, 0), at(300, 10), at(500, 0)])).toBe(600)
  })

  it("is the duration without samples or below-surface samples", () => {
    expect(diveEnd(600, [])).toBe(600)
    expect(diveEnd(600, [at(0, 0.5), at(700, 0.2)])).toBe(600)
    // dc_totaltime's fallback: the first sample, never later in practice.
    expect(diveEnd(600, [at(650, 0.5), at(700, 0.2)])).toBe(650)
    expect(lastUnderwaterSample([at(0, 0.5)])).toBeUndefined()
  })

  it("counts a sample at exactly 0.75 m as below the surface", () => {
    expect(
      lastUnderwaterSample([at(0, 5), at(700, 0.75), at(800, 0.74)])?.time
    ).toBe(700)
  })
})
