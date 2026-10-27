import { describe, expect, it } from "vitest"

import { fixtureDive } from "../../test/fixture.ts"
import { timeAxis } from "./axes.ts"
import { depthLabels, pointsInView, type DepthLabel } from "./labels.ts"
import { mergeDuplicateSamples } from "./samples.ts"
import { chartEnd, chartPoints, type ChartPoint } from "./velocity.ts"

const point = (
  time: number,
  depth: number,
  temperature: number | null = null
): ChartPoint => ({ time, depth, temperature })

const brief = (labels: DepthLabel[]) =>
  labels.map(({ time, depth, kind }) => `${kind} ${depth} at ${time}`)

describe("pointsInView", () => {
  const points = [point(0, 0), point(10, 1), point(20, 2), point(30, 0)]

  it("takes every point before the end and the first at or past it", () => {
    expect(pointsInView(points, 20)).toBe(3)
    expect(pointsInView(points, 15)).toBe(3)
  })

  it("takes them all when the axis runs past the last", () => {
    expect(pointsInView(points, 1800)).toBe(4)
  })
})

describe("depthLabels", () => {
  // Dive 63 as the phone draws it: a 300 px axis to 2502 s with 17 px
  // labels, three widths apart, gives a 426 s interval.
  const dive = fixtureDive(63)
  const samples = mergeDuplicateSamples(dive.samples)
  const points = chartPoints(samples, dive.alarmTimes)
  const axis = timeAxis(chartEnd(samples, dive.alarmTimes), 300, 20)
  const inView = pointsInView(points, axis.max)

  it("labels dive 63's deepest point first, then the peaks the walk finds", () => {
    const deepest = Math.max(...points.map((each) => each.depth))
    const labels = depthLabels(points, inView, 426)
    expect(labels[0]).toEqual({ time: 160, depth: deepest, kind: "peak" })
    expect(brief(labels)).toEqual([
      "peak 31890 at 160",
      // Right of it: the 25.5 m valley, then the 29.6 m peak 2 m below it.
      "valley 25540 at 680",
      "peak 29620 at 1060",
      // Then the safety stop's 6.3 m against the 3.9 m before it.
      "valley 3940 at 2280",
      "peak 6260 at 2380",
    ])
  })

  it("finds more peaks with a shorter interval", () => {
    expect(brief(depthLabels(points, inView, 200))).toContain(
      "peak 25090 at 1420"
    )
  })

  it("labels nothing with fewer than three points or no point 2 m deep", () => {
    // Counted as Subsurface does, with its second leading surface entry.
    expect(depthLabels([point(0, 0), point(10, 30_000)], 1, 10)).toEqual([])
    const shallow = [point(0, 0), point(10, 1999), point(20, 500), point(30, 0)]
    expect(depthLabels(shallow, 4, 10)).toEqual([])
  })

  it("labels a valley only if it is 2 m deep", () => {
    // Two 10 m peaks either side of a 1 m and then a 3 m valley.
    const dip = (valley: number) => [
      point(0, 0),
      point(10, 10_000),
      point(20, valley),
      point(30, 10_000),
      point(40, 9000),
      point(50, 8000),
      point(60, 7000),
      point(70, 0),
    ]
    expect(brief(depthLabels(dip(1000), 8, 5))).toEqual([
      "peak 10000 at 10",
      "peak 10000 at 30",
    ])
    expect(brief(depthLabels(dip(3000), 8, 5))).toEqual([
      "peak 10000 at 10",
      "valley 3000 at 20",
      "peak 10000 at 30",
    ])
  })

  it("searches to the left of a peak too", () => {
    const points = [
      point(0, 0),
      point(10, 5000),
      point(20, 6000),
      point(30, 1000),
      point(40, 20_000),
      point(50, 1000),
      point(60, 0),
    ]
    // The search crosses 2 m at 20 s, and on the left side the deepest point
    // left is taken from before that point, as Subsurface's range ends there.
    expect(brief(depthLabels(points, 7, 5))).toEqual([
      "peak 20000 at 40",
      "peak 5000 at 10",
    ])
  })

  it("stops when the deepest point left is under 2 m", () => {
    const points = [
      point(0, 0),
      point(10, 1000),
      point(20, 1500),
      point(30, 0),
      point(40, 20_000),
      point(50, 0),
      point(60, 1500),
      point(70, 1900),
      point(80, 0),
      point(90, 0),
      point(100, 0),
    ]
    expect(brief(depthLabels(points, 11, 5))).toEqual(["peak 20000 at 40"])
  })

  it("stops on the right too, past a valley above the surface", () => {
    // A computer can log a little above 0 m; 1.6 m is 2 m below -0.5 m.
    const points = [
      point(0, 0),
      point(10, 20_000),
      point(20, -500),
      point(30, 1600),
      point(40, 0),
      point(50, 0),
      point(60, 0),
      point(70, 0),
    ]
    expect(brief(depthLabels(points, 8, 5))).toEqual(["peak 20000 at 10"])
  })
})
