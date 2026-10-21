import { describe, expect, it } from "vitest"

import { fixtureDive, fixtureScubaDives } from "../../test/fixture.ts"
import { mergeDuplicateSamples, type Sample } from "./samples.ts"
import {
  chartEnd,
  chartPoints,
  speedBand,
  verticalSpeeds,
  type ChartPoint,
} from "./velocity.ts"

const at = (
  time: number,
  depth: number,
  temperature: number | null = null
): Sample => ({ time, depth, temperature, pressure: null })

const point = (time: number, depth: number): ChartPoint => ({
  time,
  depth,
  temperature: null,
})

describe("speedBand", () => {
  // Negative is ascending, in mm/s.
  it.each([
    [-24, "stable"],
    [-25, "stable"],
    [-26, "slow"],
    [-76, "slow"],
    [-77, "moderate"],
    [-152, "moderate"],
    [-153, "fast"],
    [-304, "fast"],
    [-305, "crazy"],
  ])("puts an ascent of %i mm/s in %s", (speed, band) => {
    expect(speedBand(speed)).toBe(band)
  })

  it.each([
    [0, "stable"],
    [24, "stable"],
    [25, "slow"],
    [151, "slow"],
    [152, "moderate"],
    [303, "moderate"],
    [304, "fast"],
    [506, "fast"],
    [507, "crazy"],
  ])("puts a descent of %i mm/s in %s", (speed, band) => {
    expect(speedBand(speed)).toBe(band)
  })
})

describe("verticalSpeeds", () => {
  it("truncates speeds to whole mm/s", () => {
    // 498 mm in 20 s is 24.9 mm/s, truncated to 24: Stable, not Slow.
    const points = [point(0, 0), point(20, 498)]
    expect(verticalSpeeds(points)[1]).toEqual({ speed: 24, band: "stable" })
    // An ascent of 518 mm in 20 s truncates towards zero, to -25: Stable.
    const ascent = [point(0, 1000), point(20, 482)]
    expect(verticalSpeeds(ascent)[1]).toEqual({ speed: -25, band: "stable" })
  })

  it("puts an ascent of exactly 25 mm/s in Stable and a descent in Slow", () => {
    const ascent = [point(0, 2000), point(20, 1500)]
    expect(verticalSpeeds(ascent)[1]).toEqual({ speed: -25, band: "stable" })
    const descent = [point(0, 0), point(20, 500)]
    expect(verticalSpeeds(descent)[1]).toEqual({ speed: 25, band: "slow" })
  })

  it("reads 0 for a point at the same time as the one before", () => {
    const points = [point(0, 0), point(0, 1380), point(20, 3000)]
    expect(verticalSpeeds(points)[1]).toEqual({ speed: 0, band: "stable" })
    expect(verticalSpeeds(points)[0]).toEqual({ speed: 0, band: "stable" })
  })

  it("bands a short step from the nearest point at least 15 s back", () => {
    const points = [
      point(0, 0),
      point(10, 0),
      point(20, 0),
      point(25, 0),
      point(30, 600),
    ]
    // The single step, 600 mm in 5 s, is 120 mm/s, shown as is. The band
    // looks back past 20 s, only 10 s earlier, to 10 s: 30 mm/s, Slow.
    expect(verticalSpeeds(points)[4]).toEqual({ speed: 120, band: "slow" })
    // 300 mm from 10 s is 15 mm/s: Stable, though the step is 60 mm/s.
    const levelled = [...points.slice(0, 4), point(30, 300)]
    expect(verticalSpeeds(levelled)[4]).toEqual({ speed: 60, band: "stable" })
  })

  it("looks at least two points back, however far the previous one is", () => {
    // From 45 s the point two back, at 20 s, is already 25 s earlier.
    const points = [point(0, 0), point(20, 0), point(40, 0), point(45, 400)]
    // Step: 80 mm/s (Slow). From 20 s: 400 / 25 = 16 mm/s (Stable).
    expect(verticalSpeeds(points)[3]).toEqual({ speed: 80, band: "stable" })
  })

  it("falls back to the first point when none is far enough back", () => {
    const points = [point(0, 0), point(5, 100), point(10, 200)]
    // From 0 s: 200 mm in 10 s is 20 mm/s (Stable); the step is 20 too.
    expect(verticalSpeeds(points)[2]).toEqual({ speed: 20, band: "stable" })
    const second = [point(0, 0), point(5, 300)]
    // Two back from index 1 is before the list, so the first point is used.
    expect(verticalSpeeds(second)[1]).toEqual({ speed: 60, band: "slow" })
  })

  it("keeps the single-step speed for a segment already Fast or Crazy", () => {
    // 2000 mm up in 5 s is -400 mm/s, Crazy, and 1000 mm is -200 mm/s,
    // Fast. Looking back 20 s would make both slower, but neither does.
    const points = [
      point(0, 10000),
      point(10, 10000),
      point(15, 10000),
      point(20, 8000),
    ]
    expect(verticalSpeeds(points)[3]).toEqual({ speed: -400, band: "crazy" })
    const fast = [
      point(0, 10000),
      point(10, 10000),
      point(15, 10000),
      point(20, 9000),
    ]
    expect(verticalSpeeds(fast)[3]).toEqual({ speed: -200, band: "fast" })
  })

  it("uses the single step for steps of 15 s or more", () => {
    // From 0 to 20 s: 400 mm/s (Fast) from the step; no smoothing applies.
    const points = [point(0, 0), point(5, 0), point(25, 8000)]
    expect(verticalSpeeds(points)[2]).toEqual({ speed: 400, band: "fast" })
    const slow = [point(0, 0), point(5, 3000), point(20, 3500)]
    // 500 mm in 15 s is 33 mm/s (Slow), though 3500 / 20 would be Moderate.
    expect(verticalSpeeds(slow)[2]).toEqual({ speed: 33, band: "slow" })
  })
})

describe("chartEnd", () => {
  it("is the sample after the last one under water", () => {
    // 0.75 m is at the surface; 0.751 m is under water.
    const samples = [at(0, 5), at(20, 0.751), at(30, 0.75), at(40, 0)]
    expect(chartEnd(samples, [])).toBe(30)
  })

  it("is the last event if that is later", () => {
    expect(chartEnd([at(0, 5), at(20, 0)], [50, 10])).toBe(50)
  })

  it("takes the first sample past the last event, even at the surface", () => {
    const samples = [at(0, 5), at(20, 0), at(40, 0), at(60, 0)]
    expect(chartEnd(samples, [30])).toBe(40)
    // With no events, the first sample after 0 s counts.
    expect(chartEnd([at(0, 0), at(10, 0), at(20, 0)], [])).toBe(10)
    expect(chartEnd([], [])).toBe(0)
  })
})

describe("chartPoints", () => {
  it("starts at the surface at 0 s, as Subsurface does", () => {
    const points = chartPoints([at(0, 1.38), at(4, 2)], [])
    expect(points.slice(0, 2)).toEqual([point(0, 0), point(0, 1380)])
  })

  it("adds a point every 10 s inside longer gaps", () => {
    const times = (samples: Sample[]) =>
      chartPoints(samples, []).map((each) => each.time)
    // 20 s gets one, 60 s five, 10 s and 4 s none.
    expect(times([at(0, 5), at(20, 5)])).toEqual([0, 0, 10, 20, 21, 22])
    expect(times([at(0, 5), at(60, 5)])).toEqual([
      0, 0, 10, 20, 30, 40, 50, 60, 61, 62,
    ])
    expect(times([at(0, 5), at(10, 5)])).toEqual([0, 0, 10, 11, 12])
    expect(times([at(0, 5), at(4, 5), at(8, 5)])).toEqual([0, 0, 4, 8, 9, 10])
  })

  it("interpolates depth in a straight line, rounded to the mm", () => {
    const points = chartPoints([at(0, 10), at(30, 11)], [])
    expect(points.map((each) => each.depth)).toEqual([
      0, 10000, 10333, 10667, 11000, 0, 0,
    ])
  })

  it("interpolates from the surface before the first sample", () => {
    const points = chartPoints([at(20, 10)], [])
    expect(points.slice(0, 3)).toEqual([
      point(0, 0),
      point(10, 5000),
      point(20, 10000),
    ])
  })

  it("carries the temperature forward", () => {
    const points = chartPoints([at(0, 5, 21.5), at(20, 6), at(40, 7, 21)], [])
    expect(points.map((each) => each.temperature)).toEqual([
      null,
      21.5,
      21.5,
      21.5,
      21.5,
      21,
      null,
      null,
    ])
  })

  it("adds a point at each event's time", () => {
    const points = chartPoints([at(0, 10), at(20, 12)], [5, 15])
    expect(points.map((each) => [each.time, each.depth])).toEqual([
      [0, 0],
      [0, 10000],
      [5, 10500],
      [10, 11000],
      [15, 11500],
      [20, 12000],
      [21, 0],
      [22, 0],
    ])
  })

  it("adds no extra point for an event at a sample's or a 10 s point's time", () => {
    const points = chartPoints([at(0, 10), at(20, 12)], [10, 20])
    expect(points.map((each) => each.time)).toEqual([0, 0, 10, 20, 21, 22])
  })

  it("skips events at 0 s and puts later ones at the surface", () => {
    const points = chartPoints([at(0, 2), at(4, 1)], [0, 9, 9, 12])
    expect(points.map((each) => [each.time, each.depth])).toEqual([
      [0, 0],
      [0, 2000],
      [4, 1000],
      [9, 0],
      [12, 0],
      [13, 0],
      [14, 0],
    ])
  })

  it("ends at the surface 1 and 2 s after the last point, as Subsurface does", () => {
    // Fixture dive 39 ends on a sample at 1.3 m; the line still surfaces.
    const points = chartPoints([at(0, 5, 21), at(4, 1.2)], [])
    expect(points.slice(-3)).toEqual([
      { time: 4, depth: 1200, temperature: 21 },
      point(5, 0),
      point(6, 0),
    ])
    expect(chartPoints([], [])).toEqual([point(0, 0), point(1, 0), point(2, 0)])
  })

  it("stops one sample past the end, leaving off the rest of the surface", () => {
    // Under water until 20 s, so the end is 30 s; 40 s is the one past it.
    const samples = [at(0, 5), at(20, 5), at(30, 0.5), at(40, 0.2), at(60, 0)]
    expect(chartPoints(samples, []).map((each) => each.time)).toEqual([
      0, 0, 10, 20, 30, 40, 41, 42,
    ])
    // No 10 s points past the end either: 30 s to 60 s gets none.
    const gap = [at(0, 5), at(20, 5), at(30, 0.5), at(60, 0)]
    expect(chartPoints(gap, []).map((each) => each.time)).toEqual([
      0, 0, 10, 20, 30, 60, 61, 62,
    ])
  })

  it("takes events in any order", () => {
    const samples = [at(0, 10), at(20, 12)]
    expect(chartPoints(samples, [15, 5])).toEqual(chartPoints(samples, [5, 15]))
  })

  it("leaves no gap over 10 s on fixture dive 63's 20 s log", () => {
    const dive = fixtureDive(63)
    const samples = mergeDuplicateSamples(dive.samples)
    const points = chartPoints(samples, dive.alarmTimes)
    const sampled = samples.filter((sample) => sample.time > 0)
    // One point inside each 20 s gap, and every sample kept.
    const gaps = samples.filter(
      (sample, i) => i > 0 && sample.time - samples[i - 1].time === 20
    ).length
    expect(gaps).toBeGreaterThan(100)
    expect(points.length).toBeGreaterThanOrEqual(1 + samples.length + gaps)
    for (const sample of sampled) {
      expect(points.some((each) => each.time === sample.time)).toBe(true)
    }
    for (const time of dive.alarmTimes.filter((time) => time > 0)) {
      expect(points.some((each) => each.time === time)).toBe(true)
    }
  })

  it("leaves no gap over 10 s and keeps time in order on every scuba dive", () => {
    for (const dive of fixtureScubaDives()) {
      const points = chartPoints(
        mergeDuplicateSamples(dive.samples),
        dive.alarmTimes
      )
      for (let i = 1; i < points.length; i++) {
        const gap = points[i].time - points[i - 1].time
        expect(
          gap,
          `dive ${dive.number} at ${points[i].time} s`
        ).toBeGreaterThanOrEqual(0)
        expect(
          gap,
          `dive ${dive.number} at ${points[i].time} s`
        ).toBeLessThanOrEqual(10)
      }
    }
  })
})
