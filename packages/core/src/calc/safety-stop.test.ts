import { describe, expect, it } from "vitest"

import { fixtureDive, fixtureScubaDives } from "../../test/fixture.ts"
import { isFullStop, safetyStop } from "./safety-stop.ts"
import { mergeDuplicateSamples, type Sample } from "./samples.ts"

// A profile from [seconds, metres] pairs.
const dive = (points: [number, number][]): Sample[] =>
  points.map(([time, depth]) => ({
    time,
    depth,
    temperature: null,
    pressure: null,
  }))

// 20 m for ten minutes, then up through 10 m at 660 s and into the band
// at 684 s, reaching 5 m at 690 s.
const descent: [number, number][] = [
  [0, 0],
  [60, 20],
  [600, 20],
  [690, 5],
]

describe("safetyStop", () => {
  it("finds a clean 3-minute stop at 5 m", () => {
    // 6 s in on the way up, 180 s at 5 m, 4 s on the way out to 3 m.
    const stop = safetyStop(dive([...descent, [870, 5], [880, 0]]))
    expect(stop).toEqual({ start: 684, end: 874, held: 190, depth: 4995 })
    expect(isFullStop(stop!)).toBe(true)
  })

  it("pauses the count while drifting out of the band, never resetting it", () => {
    // 66 s at 5 m, a minute at 7 m, then back for two more minutes.
    const stop = safetyStop(
      dive([
        ...descent,
        [750, 5],
        [760, 7],
        [820, 7],
        [830, 5],
        [950, 5],
        [960, 0],
      ])
    )
    expect(stop).toMatchObject({ start: 684, end: 954, held: 200 })
  })

  it("starts again after going back below 10 m", () => {
    // Two minutes at 5 m, back down to 15 m, then 100 s at 5 m.
    const stop = safetyStop(
      dive([
        ...descent,
        [810, 5],
        [840, 15],
        [960, 15],
        [990, 5],
        [1090, 5],
        [1100, 0],
      ])
    )
    expect(stop).toMatchObject({ start: 987, end: 1094, held: 107 })
    expect(isFullStop(stop!)).toBe(false)
  })

  it("ends a complete stop at its first exit, not the dive's shallow finish", () => {
    // 3:20 at 5 m, up to 2 m, then five more minutes at 5 m.
    const stop = safetyStop(
      dive([...descent, [880, 5], [890, 2], [900, 5], [1200, 5], [1210, 0]])
    )
    expect(stop).toMatchObject({ start: 684, end: 887, held: 203 })
  })

  it("ends a stop at an exit whose held time rounds to full", () => {
    // 169.6 s by the exit through 3 m at 853.6 s, so full, and the minute
    // back at 5 m after it isn't counted.
    const stop = safetyStop(
      dive([...descent, [844, 5], [856, 2.5], [866, 5], [966, 5], [976, 0]])
    )
    expect(stop).toMatchObject({ start: 684, end: 854, held: 170 })
    expect(isFullStop(stop!)).toBe(true)
  })

  it("keeps counting past 3 minutes while the diver stays in the band", () => {
    const stop = safetyStop(dive([...descent, [990, 5], [1000, 0]]))
    expect(stop).toMatchObject({ start: 684, end: 994, held: 310 })
  })

  it("counts only the part of each 20 s line inside the band", () => {
    // Swinging between 6.2 and 5.8 m: half of each line is at 6 m or less.
    const swing: [number, number][] = Array.from({ length: 11 }, (_, i) => [
      620 + i * 20,
      i % 2 ? 5.8 : 6.2,
    ])
    const stop = safetyStop(
      dive([[0, 0], [60, 15], [600, 15], ...swing, [840, 0]])
    )
    expect(stop).toMatchObject({ start: 630, end: 830, held: 110 })
    expect(isFullStop(stop!)).toBe(false)
  })

  it("counts a stop held exactly on 3 m or on 6 m, but not just past 6 m", () => {
    for (const depth of [3, 6]) {
      expect(
        safetyStop(dive([...descent, [700, depth], [900, depth], [910, 0]])),
        `${depth} m`
      ).not.toBeNull()
    }
    expect(
      safetyStop(dive([...descent, [700, 6.001], [900, 6.001], [910, 0]]))
    ).toBeNull()
  })

  it("lists a stop under 3 minutes as short, and none under a minute", () => {
    const short = safetyStop(dive([...descent, [790, 5], [800, 0]]))
    expect(short).toMatchObject({ held: 110 })
    expect(isFullStop(short!)).toBe(false)
    expect(safetyStop(dive([...descent, [730, 5], [740, 0]]))).toBeNull()
  })

  it("finds none on a dive no deeper than 10 m", () => {
    const shallow = dive([
      [0, 0],
      [60, 10],
      [600, 10],
      [660, 5],
      [1000, 5],
      [1010, 0],
    ])
    expect(safetyStop(shallow)).toBeNull()
  })

  it("finds none on a dive that ends below 10 m", () => {
    expect(
      safetyStop(
        dive([
          [0, 0],
          [60, 20],
          [600, 12],
        ])
      )
    ).toBeNull()
  })

  it("skips a repeated time", () => {
    const stop = safetyStop(
      dive([...descent, [780, 5], [780, 5.5], [870, 5], [880, 0]])
    )
    expect(stop).toMatchObject({ start: 684, end: 874, held: 190 })
  })
})

describe("safetyStop on the real exports", () => {
  // Full, short, and none, over every scuba dive in each export.
  const counts = (from: "d4i" | "zoopNovo") => {
    const found = fixtureScubaDives(from).map((each) =>
      safetyStop(mergeDuplicateSamples(each.samples))
    )
    return {
      full: found.filter((stop) => stop && isFullStop(stop)).length,
      short: found.filter((stop) => stop && !isFullStop(stop)).length,
      none: found.filter((stop) => !stop).length,
    }
  }

  it("finds the D4i's stops", () => {
    // The short ones are 2019's dives 1, 2 and 4, which really were short.
    expect(counts("d4i")).toEqual({ full: 27, short: 3, none: 16 })
  })

  it("finds the Zoop Novo's stops", () => {
    expect(counts("zoopNovo")).toEqual({ full: 12, short: 0, none: 19 })
  })

  it("pauses dive 63's stop at 6.1 m and ends it before its 6.3 m peak", () => {
    // Into the band at 2061 s, a moment at 6.08 m at 2160 s, then out
    // through 6 m at 2352 s, complete, so the 6.26 m at 2380 s is after it.
    const stop = safetyStop(mergeDuplicateSamples(fixtureDive(63).samples))
    expect(stop).toEqual({ start: 2061, end: 2352, held: 285, depth: 5016 })
  })
})
