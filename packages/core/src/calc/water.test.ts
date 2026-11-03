import { describe, expect, it } from "vitest"

import { fixtureDiveAt } from "../../test/fixture.ts"
import { mergeDuplicateSamples } from "./samples.ts"
import { chartPoints, type ChartPoint } from "./velocity.ts"
import { smoothTemperatures } from "./water.ts"

// A dive every 10 s from a list of [depth m, temperature °C] pairs, as the
// chart's points carry the temperature forward.
const dive = (steps: [number, number | null][]): ChartPoint[] =>
  steps.map(([depth, temperature], i) => ({
    time: i * 10,
    depth: depth * 1000,
    temperature,
  }))

const repeat = <T>(times: number, item: T): T[] =>
  Array.from({ length: times }, () => item)

// Each change in the smoothed line as "m:ss value", in whole degrees,
// leaving out the points with no temperature at either end.
function changes(points: readonly ChartPoint[], values: (number | null)[]) {
  const out: string[] = []
  let last: number | undefined
  values.forEach((value, i) => {
    if (value == null) return
    const shown = Math.round(value)
    if (shown === last) return
    const { time } = points[i]
    out.push(
      `${Math.floor(time / 60)}:${String(time % 60).padStart(2, "0")} ${shown}`
    )
    last = shown
  })
  return out
}

describe("smoothTemperatures", () => {
  it("keeps the recorded line when no reading settles", () => {
    const points = dive([[0, null], ...repeat<[number, number]>(20, [0.5, 24])])
    expect(smoothTemperatures(points)).toEqual(points.map((p) => p.temperature))
  })

  it("starts from the first settled reading that holds, not the warm surface", () => {
    // Down to 10 m in a minute while the sensor cools from 20 °C; 18 °C has
    // settled but changes 40 s later, so 17 °C is the first that holds.
    const points = dive([
      [0, null],
      [2, 20],
      [4, 20],
      [6, 19],
      [8, 19],
      [10, 18],
      ...repeat<[number, number]>(10, [10, 18]),
      ...repeat<[number, number]>(40, [10, 17]),
    ])
    const values = smoothTemperatures(points)
    expect(values[0]).toBeNull()
    expect(changes(points, values)).toEqual(["0:10 17"])
  })

  it("ignores a change that doesn't hold for 2 minutes and keeps one that does", () => {
    const points = dive([
      [0, null],
      ...repeat<[number, number]>(20, [10, 14]),
      // A minute at 13 °C, then back: rounding, not the water.
      ...repeat<[number, number]>(6, [10, 13]),
      ...repeat<[number, number]>(20, [10, 14]),
      // Three minutes at 13 °C: the water changed.
      ...repeat<[number, number]>(18, [10, 13]),
    ])
    expect(changes(points, smoothTemperatures(points))).toEqual([
      "0:10 14",
      "7:50 13",
    ])
  })

  it("follows the water column by depth across a thermocline", () => {
    // 20 °C held at 4.5 m and 14 °C held at 16.5 m, band centres 4.5 and
    // 16.5 m, so 10.5 m is halfway.
    const points = dive([
      [0, null],
      ...repeat<[number, number]>(20, [4.5, 20]),
      ...repeat<[number, number]>(20, [16.5, 14]),
      [7.5, 14],
      [10.5, 14],
      [1, 15],
    ])
    const values = smoothTemperatures(points)
    expect(values[1]).toBe(20)
    expect(values[30]).toBe(14)
    // A quarter of the way down, 18.5 °C, in whole degrees as the readings
    // (a half to the even one, as lrint).
    expect(values.at(-3)).toBe(18)
    expect(values.at(-2)).toBe(17)
    // Above the shallowest band, its value.
    expect(values.at(-1)).toBe(20)
  })

  it("anchors each band where its readings were taken, not at its centre", () => {
    // 20 °C held at 3 m and 17 °C at 6 m: at 6 m, the computer's own 17.
    const points = dive([
      [0, null],
      ...repeat<[number, number]>(20, [3, 20]),
      ...repeat<[number, number]>(20, [6, 17]),
      [4.5, 17],
    ])
    const values = smoothTemperatures(points)
    expect(values[30]).toBe(17)
    expect(values.at(-1)).toBe(18)
  })

  it("keeps a band's tenths at its own depth", () => {
    const points = dive([
      [0, null],
      ...repeat<[number, number]>(20, [4.5, 20]),
      ...repeat<[number, number]>(20, [10.5, 17.3]),
      ...repeat<[number, number]>(20, [16.5, 14]),
    ])
    expect(smoothTemperatures(points)[30]).toBe(17.3)
  })

  it("needs a minute of settled readings for a band", () => {
    // A minute and a bit at 4.5 m with the sensor still at 20 °C, then the
    // dive in 17 °C water at 16.5 m: no thermocline, so no 20 by depth.
    const points = dive([
      [0, null],
      ...repeat<[number, number]>(8, [4.5, 20]),
      ...repeat<[number, number]>(30, [16.5, 17]),
      [4.5, 17],
    ])
    const values = smoothTemperatures(points)
    expect(values.at(-1)).toBe(17)
    expect(values[1]).toBe(17)
  })

  it("draws no column when the bands are under 2 °C apart", () => {
    // 20 °C at 4.5 m and 19 °C at 16.5 m: rounding, so no 19.5 on the way.
    const points = dive([
      [0, null],
      ...repeat<[number, number]>(20, [4.5, 20]),
      [10.5, 20],
      ...repeat<[number, number]>(20, [16.5, 19]),
    ])
    const values = smoothTemperatures(points)
    expect(values[21]).toBe(20)
    expect(new Set(values.slice(1))).toEqual(new Set([20, 19]))
  })

  it("leaves out readings while the depth is changing", () => {
    // Down a metre every 10 s: nothing settles, so the recorded line.
    const points = dive(
      Array.from({ length: 30 }, (_, i): [number, number] => [i, 25 - i / 3])
    )
    expect(smoothTemperatures(points)).toEqual(points.map((p) => p.temperature))
  })

  it("leaves out the first minute, whatever the depth", () => {
    // At 10 m from the first point, 22 °C for 140 s and then 18 °C: 22 has
    // held 2 minutes, but only from before the dive's first minute was up.
    const points = dive([
      ...repeat<[number, number]>(14, [10, 22]),
      ...repeat<[number, number]>(30, [10, 18]),
    ])
    expect(smoothTemperatures(points)[0]).toBe(18)
  })

  it("starts from the first settled reading when none holds", () => {
    // 14 and 15 °C a minute each, never 2 minutes of either; the first to
    // settle, at 70 s, is a 15.
    const steps: [number, number][] = [[0, 14]]
    for (let i = 0; i < 6; i++)
      steps.push(...repeat<[number, number]>(6, [10, i % 2 ? 15 : 14]))
    const values = smoothTemperatures(dive(steps))
    expect(new Set(values)).toEqual(new Set([15]))
  })

  it("doesn't show a change in the dive's last 2 minutes", () => {
    // 15 °C for the last 30 s before the closing surface points.
    const points = dive([
      [0, null],
      ...repeat<[number, number]>(20, [5, 14]),
      ...repeat<[number, number]>(3, [5, 15]),
      [0, null],
      [0, null],
    ])
    const values = smoothTemperatures(points)
    expect(values.slice(1, -2)).toEqual(repeat(23, 14))
    expect(values.slice(-2)).toEqual([null, null])
  })

  it("keeps a computer's tenths where the line is its own readings", () => {
    const points = dive([
      [0, null],
      ...repeat<[number, number]>(30, [20, -1.9]),
    ])
    expect(smoothTemperatures(points).at(-1)).toBe(-1.9)
  })

  it("takes a band's lower middle reading, one the computer recorded", () => {
    // 14 and 15 °C equally often at 16.5 m: 14, not 14.5.
    const points = dive([
      [0, null],
      ...repeat<[number, number]>(20, [4.5, 20]),
      // The band's first minute isn't settled yet, so ten readings of each.
      ...repeat<[number, number]>(16, [16.5, 14]),
      ...repeat<[number, number]>(10, [16.5, 15]),
    ])
    expect(smoothTemperatures(points).at(-1)).toBe(14)
  })
})

describe("smoothTemperatures on the real exports", () => {
  const smoothed = (start: string, from?: "d4i" | "zoopNovo") => {
    const { samples, alarmTimes } = fixtureDiveAt(start, from)
    const points = chartPoints(mergeDuplicateSamples(samples), alarmTimes)
    const values = smoothTemperatures(points)
    const shown = values.filter((value) => value != null)
    return {
      changes: changes(points, values),
      min: Math.min(...shown),
      max: Math.max(...shown),
    }
  }

  it("reads 30 December 2025 at 17 °C throughout on both computers", () => {
    // Recorded, both start at 20 °C and the D4i ends at 18.
    for (const from of ["d4i", "zoopNovo"] as const) {
      expect(smoothed("2025-12-30T11:43", from)).toMatchObject({
        min: 17,
        max: 17,
      })
    }
  })

  it("finds the thermocline of 4 April 2026 on both computers", () => {
    // 20 °C down to 15 m and 14 or 15 °C below: each computer's own reading.
    expect(smoothed("2026-04-04T16:22")).toMatchObject({ min: 14, max: 20 })
    expect(smoothed("2026-04-04T16:22", "zoopNovo")).toMatchObject({
      min: 15,
      max: 20,
    })
  })

  it("keeps the slow change of 16 August 2026 and drops its flicker", () => {
    // Recorded, it flickers between 13 and 14 °C from 22:40, the last 14 °C
    // only 20 s before the dive ends.
    expect(smoothed("2026-08-16T10:12").changes).toEqual([
      "0:00 14",
      "27:40 13",
    ])
  })

  it("holds Sodwana's flat 23 °C from the start", () => {
    // Recorded, it starts at 22 °C.
    expect(smoothed("2026-07-19T08:43").changes).toEqual(["0:00 23"])
  })
})
