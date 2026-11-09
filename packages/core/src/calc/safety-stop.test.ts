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
// (6.4 m) at 681.6 s, reaching 5 m at 690 s.
const descent: [number, number][] = [
  [0, 0],
  [60, 20],
  [600, 20],
  [690, 5],
]

describe("safetyStop", () => {
  it("finds a clean 3-minute stop at 5 m", () => {
    // 8.4 s in on the way up, 180 s at 5 m, 4 s on the way out to 3 m.
    const stop = safetyStop(dive([...descent, [870, 5], [880, 0]]))
    expect(stop).toEqual({ start: 682, end: 874, held: 192, depth: 5010 })
    expect(isFullStop(stop!)).toBe(true)
  })

  it("pauses the stop for a drift out of the band under 2 minutes", () => {
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
    expect(stop).toMatchObject({ start: 682, end: 954, held: 206 })
  })

  it("starts a new stretch after a longer drift, and takes the last full one", () => {
    // 40 s at 5 m, 16 minutes at 8 m, then 3.5 minutes at 5 m.
    const stop = safetyStop(
      dive([
        ...descent,
        [730, 5],
        [740, 8],
        [1700, 8],
        [1710, 5],
        [1920, 5],
        [1930, 0],
      ])
    )
    expect(stop).toMatchObject({ start: 1705, end: 1924, held: 219 })
    expect(isFullStop(stop!)).toBe(true)
  })

  it("keeps a full stop over a later short pass through the band", () => {
    // 3.5 minutes at 5 m, 5 minutes at 8 m, then 90 s at 5 m.
    const stop = safetyStop(
      dive([
        ...descent,
        [900, 5],
        [910, 8],
        [1210, 8],
        [1220, 5],
        [1310, 5],
        [1320, 0],
      ])
    )
    expect(stop).toMatchObject({ start: 682, end: 905, held: 223 })
  })

  it("runs a long stop through its brief dips to the end", () => {
    // 4 minutes at 5 m, 30 s at 6.9 m, then 5 more minutes at 5 m.
    const stop = safetyStop(
      dive([
        ...descent,
        [930, 5],
        [940, 6.9],
        [970, 6.9],
        [980, 5],
        [1280, 5],
        [1290, 0],
      ])
    )
    expect(stop).toMatchObject({ start: 682, end: 1284, held: 567 })
  })

  it("takes the longest stretch when none is full", () => {
    // 2 minutes at 5 m, 4 minutes at 8 m, then 70 s at 5 m.
    const stop = safetyStop(
      dive([
        ...descent,
        [810, 5],
        [820, 8],
        [1060, 8],
        [1070, 5],
        [1140, 5],
        [1150, 0],
      ])
    )
    expect(stop).toMatchObject({ start: 682, end: 815, held: 133 })
    expect(isFullStop(stop!)).toBe(false)
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
    expect(stop).toMatchObject({ start: 986, end: 1094, held: 108 })
    expect(isFullStop(stop!)).toBe(false)
  })

  it("keeps counting past 3 minutes while the diver stays in the band", () => {
    const stop = safetyStop(dive([...descent, [990, 5], [1000, 0]]))
    expect(stop).toMatchObject({ start: 682, end: 994, held: 312 })
  })

  it("counts only the part of each 20 s line inside the band", () => {
    // Swinging between 6.6 and 6.2 m: half of each line is at 6.4 m or less.
    const swing: [number, number][] = Array.from({ length: 11 }, (_, i) => [
      620 + i * 20,
      i % 2 ? 6.2 : 6.6,
    ])
    const stop = safetyStop(
      dive([[0, 0], [60, 15], [600, 15], ...swing, [840, 0]])
    )
    expect(stop).toMatchObject({ start: 630, end: 831, held: 110 })
    expect(isFullStop(stop!)).toBe(false)
  })

  it("counts a stop held exactly on 3 m or on 6.4 m, but not just past it", () => {
    for (const depth of [3, 6.4]) {
      expect(
        safetyStop(dive([...descent, [700, depth], [900, depth], [910, 0]])),
        `${depth} m`
      ).not.toBeNull()
    }
    expect(
      safetyStop(dive([...descent, [700, 6.401], [900, 6.401], [910, 0]]))
    ).toBeNull()
  })

  it("lists a stop under 3 minutes as short, and none under a minute", () => {
    const short = safetyStop(dive([...descent, [790, 5], [800, 0]]))
    expect(short).toMatchObject({ held: 112 })
    expect(isFullStop(short!)).toBe(false)
    expect(safetyStop(dive([...descent, [725, 5], [735, 0]]))).toBeNull()
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
    expect(stop).toMatchObject({ start: 682, end: 874, held: 192 })
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

  it("runs dive 63's stop through its 6.3 m peak to the surface", () => {
    // Into the band at 2057 s, 6.26 m at 2380 s, 40 s above 3 m from
    // 2440 s, then out through 3 m for good at 2481 s.
    const stop = safetyStop(mergeDuplicateSamples(fixtureDive(63).samples))
    expect(stop).toEqual({ start: 2057, end: 2481, held: 380, depth: 5125 })
  })

  it("keeps dive 54's long stop whole through its dips to 6.9 m", () => {
    const stop = safetyStop(mergeDuplicateSamples(fixtureDive(54).samples))
    expect(stop).toMatchObject({ start: 1172, end: 1822, held: 579 })
  })

  it("starts dive 72's stop after its 16 minutes at 8 m", () => {
    // About 40 s in the band from 2431 s, then 7 to 9 m until 3427 s.
    const stop = safetyStop(mergeDuplicateSamples(fixtureDive(72).samples))
    expect(stop).toMatchObject({ start: 3427, end: 3647, held: 221 })
  })
})
