import { describe, expect, it } from "vitest"

import { fixtureDive } from "../../test/fixture.ts"
import { defaultSettings } from "../schemas/settings.ts"
import {
  deepestPoint,
  depthAxis,
  labelInterval,
  minChartDepth,
  minChartTime,
  modInView,
  zoomedMinChartTime,
  temperatureAxis,
  timeAxis,
  timeLabel,
} from "./axes.ts"
import { diveOxygen } from "./gas.ts"
import { mod } from "./mod.ts"
import { mergeDuplicateSamples } from "./samples.ts"
import { chartEnd, chartPoints, type ChartPoint } from "./velocity.ts"

const salt = { waterType: "salt" } as const

// A fixture dive's chart: its points, deepest point and end.
function chart(number: number) {
  const dive = fixtureDive(number)
  const samples = mergeDuplicateSamples(dive.samples)
  const points = chartPoints(samples, dive.alarmTimes)
  return {
    dive,
    points,
    deepest: deepestPoint(dive.maxDepth, points),
    end: chartEnd(samples, dive.alarmTimes),
  }
}

// About 10 depth labels: a 160 px axis with 8 px labels, two heights each.
const tenLabels = (deepest: number) => depthAxis(deepest, 160, 8)

describe("depthAxis", () => {
  it("gives dive 63 36 m: 35.66 m rounded up to the 4 m step", () => {
    const { deepest } = chart(63)
    expect(deepest).toBe(32_660)
    const axis = tenLabels(deepest)
    expect(Math.round(axis.max)).toBe(36_000)
    expect(Math.round(axis.values[1])).toBe(4000)
  })

  it("gives the spec's 38 m dive 45 m", () => {
    expect(Math.round(tenLabels(38_000).max)).toBe(45_000)
  })

  it("gives dive 54 50 m", () => {
    expect(Math.round(tenLabels(chart(54).deepest).max)).toBe(50_000)
  })

  it("starts from 30 m for dives 7 and 40, then rounds to the 4 m step", () => {
    for (const number of [7, 40]) {
      const { deepest } = chart(number)
      expect(deepest + 3000).toBeLessThan(minChartDepth)
      expect(Math.round(tenLabels(deepest).max)).toBe(32_000)
    }
    expect(Math.round(depthAxis(0, 160, 16).max)).toBe(minChartDepth)
  })

  it("fits the dive with no floor when zoomed, as the detail chart is", () => {
    const zoomed = (deepest: number) =>
      Math.round(depthAxis(deepest, 160, 8, { zoomed: true }).max)
    // 13.38 + 3 m is 1.64 m a tick, so 2 m steps to 18 m.
    expect(zoomed(chart(7).deepest)).toBe(18_000)
    // 3.2 + 3 m in whole-metre steps, the finest the labels show.
    expect(zoomed(chart(40).deepest)).toBe(7000)
    // Deep dives are unchanged.
    expect(zoomed(chart(63).deepest)).toBe(36_000)
  })
})

describe("deepestPoint", () => {
  it("is the recorded maximum or a deeper point", () => {
    const points: ChartPoint[] = [
      { time: 0, depth: 0, temperature: null },
      { time: 10, depth: 12_345, temperature: null },
    ]
    expect(deepestPoint(12, points)).toBe(12_345)
    expect(deepestPoint(13.0004, points)).toBe(13_000)
  })
})

describe("modInView", () => {
  const limit = defaultSettings.maxPo2
  const line = (number: number) => {
    const { dive, deepest } = chart(number)
    const at = mod(diveOxygen(dive)!, limit, salt)
    return { at, shown: modInView(at, tenLabels(deepest)) }
  }

  it("draws the line for dives 63 and 61, inside their axes", () => {
    expect(line(63)).toEqual({ at: 33.2, shown: true })
    expect(line(61)).toEqual({ at: 31.9, shown: true })
  })

  it("leaves it off dive 54, whose air MOD is past the axis", () => {
    expect(line(54)).toEqual({ at: 56.2, shown: false })
  })

  it("leaves it off a dive with no MOD", () => {
    expect(modInView(null, tenLabels(30_000))).toBe(false)
  })
})

describe("timeAxis", () => {
  it("runs dive 6 to its last sample, 502 s, not its 180 s duration, then 30 min", () => {
    const { dive, end } = chart(6)
    expect(dive.duration).toBe(180)
    expect(end).toBe(502)
    expect(timeAxis(end, 326, 20).max).toBe(minChartTime)
  })

  it("keeps the 30 min minimum for dives 7 and 40", () => {
    for (const number of [7, 40]) {
      expect(timeAxis(chart(number).end, 326, 20).max).toBe(minChartTime)
    }
  })

  it("fits the dive when zoomed, down to 30 s", () => {
    expect(timeAxis(chart(6).end, 326, 20, { zoomed: true }).max).toBe(502)
    expect(timeAxis(chart(7).end, 326, 20, { zoomed: true }).max).toBe(100)
    expect(timeAxis(12, 326, 20, { zoomed: true }).max).toBe(zoomedMinChartTime)
  })

  it("keeps a longer dive's exact end, with ticks inside it", () => {
    const { end } = chart(63)
    expect(end).toBe(2502)
    const axis = timeAxis(end, 326, 20)
    expect(axis.max).toBe(2502)
    expect(axis.values.at(-1)).toBeLessThanOrEqual(2502)
    expect(axis.values[0]).toBe(0)
  })
})

describe("timeLabel", () => {
  it("shows whole minutes", () => {
    const axis = timeAxis(2502, 326, 20)
    expect(timeLabel(600, axis)).toBe("10")
    expect(timeLabel(2399.6, axis)).toBe("40")
  })

  it("shows m:ss when under 10 minutes are in view", () => {
    const axis = { min: 0, max: 599, values: [] }
    expect(timeLabel(90, axis)).toBe("1:30")
    expect(timeLabel(5, axis)).toBe("0:05")
  })

  it("rounds a tick that drifted below a whole minute", () => {
    const axis = { min: 0, max: 502, values: [] }
    expect(timeLabel(119.99999999, axis)).toBe("2:00")
  })
})

describe("temperatureAxis", () => {
  const at = (temperature: number | null): ChartPoint => ({
    time: 0,
    depth: 0,
    temperature,
  })

  it("runs from the lowest to the highest temperature", () => {
    expect(temperatureAxis([at(null), at(19), at(23.5)])).toEqual({
      min: 19,
      max: 23.5,
      highest: 23.5,
    })
  })

  it("is at least 2 °C wide, compared in whole mK", () => {
    expect(temperatureAxis([at(22.1), at(24.1)])).toEqual({
      min: 22.1,
      max: 24.1,
      highest: 24.1,
    })
    expect(temperatureAxis([at(22.1), at(24.2)])!.max).toBe(24.2)
    expect(temperatureAxis([at(22), at(23)])).toEqual({
      min: 22,
      max: 24,
      highest: 23,
    })
  })

  it("is null with no temperatures", () => {
    expect(temperatureAxis([at(null)])).toBeNull()
  })
})

describe("labelInterval", () => {
  it("is the seconds three label widths cover, rounded up", () => {
    const axis = { min: 0, max: 1800, values: [] }
    expect(labelInterval(20, axis, 326)).toBe(Math.ceil((60 * 1800) / 326))
  })
})
