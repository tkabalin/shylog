import { describe, expect, it } from "vitest"

import { boxPlot, rateScale, sacTrend, timeAxis, trendChange } from "./trend"
import { dive } from "./synthetic"

const rated = (...rates: number[]) =>
  rates.map((sac, i) => ({
    dive: dive({
      startTime: `2026-03-${String(i + 1).padStart(2, "0")}T09:00:00`,
    }),
    sac,
  }))

describe("sacTrend", () => {
  it("averages the last five dives, fewer at the start", () => {
    const trend = sacTrend(rated(20, 18, 16, 14, 12, 10, 20))
    expect(trend.map((point) => point.average)).toEqual([
      20, 19, 18, 17, 16, 14, 14.4,
    ])
  })

  it("keeps the dives' own order and rates", () => {
    const trend = sacTrend(rated(15, 13))
    expect(trend.map((point) => [point.dive.startTime, point.sac])).toEqual([
      ["2026-03-01T09:00:00", 15],
      ["2026-03-02T09:00:00", 13],
    ])
  })
})

describe("trendChange", () => {
  it("waits for a sixth dive", () => {
    expect(trendChange(sacTrend(rated(20, 18, 16, 14, 12)))).toBeNull()
  })

  it("is the move from the first full window to the latest", () => {
    expect(trendChange(sacTrend(rated(20, 18, 16, 14, 12, 10)))).toEqual({
      change: -2,
      since: "2026-03-01T09:00:00",
    })
  })
})

describe("rateScale", () => {
  it("pins a far-off rate to the top and ticks at round values", () => {
    // The demo log's rates: one 33.2 L/min dive among 8.6 to 23.6.
    const scale = rateScale([
      13.7, 10.5, 11.6, 17.4, 15.3, 33.2, 15.7, 23.6, 17.9, 23.5, 10.4, 16.9,
      13.6, 9, 12.8, 18.2, 8.9, 14.6, 15.4, 11.5, 8.7, 10.7, 10.6, 11.1, 10.3,
      9.6, 10.6, 11.5, 13.5, 8.6, 14.7, 11.3, 12, 16.7, 11.7, 10.3, 10.4,
    ])
    expect(scale).toEqual({ low: 7, high: 25, ticks: [10, 20] })
  })

  it("keeps a high rate among equal ones, which have no spread", () => {
    expect(rateScale([10, 10, 10, 10, 15]).high).toBe(16)
  })

  it("steps down to smaller ticks for a narrow range", () => {
    expect(rateScale([12, 13, 14]).ticks).toEqual([12, 14])
  })

  it("never goes below 0", () => {
    expect(rateScale([0.5, 2]).low).toBe(0)
  })

  it("keeps an average lifted by a pinned rate on the chart", () => {
    // A mis-entered 40 among rates near 12 lifts five averages to 17.6.
    const scale = rateScale([12, 12, 12, 12, 12, 12, 40], [12, 17.6])
    expect(scale.high).toBe(19)
  })
})

describe("boxPlot", () => {
  it("ends the whiskers at the last rates within reach of the box", () => {
    // The demo log's rates again: the box is 10.5 to 15.4, so the upper
    // whisker reaches 22.75 at most and stops at the 18.2 below it.
    const box = boxPlot([
      13.7, 10.5, 11.6, 17.4, 15.3, 33.2, 15.7, 23.6, 17.9, 23.5, 10.4, 16.9,
      13.6, 9, 12.8, 18.2, 8.9, 14.6, 15.4, 11.5, 8.7, 10.7, 10.6, 11.1, 10.3,
      9.6, 10.6, 11.5, 13.5, 8.6, 14.7, 11.3, 12, 16.7, 11.7, 10.3, 10.4,
    ])
    expect(box).toEqual({
      q1: 10.5,
      median: 11.7,
      q3: 15.4,
      low: 8.6,
      high: 18.2,
      outliers: [23.5, 23.6, 33.2],
    })
  })

  it("marks any other rate an outlier when the box has no width", () => {
    expect(boxPlot([10, 10, 10, 10, 15])).toEqual({
      q1: 10,
      median: 10,
      q3: 10,
      low: 10,
      high: 10,
      outliers: [15],
    })
  })
})

const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000

describe("timeAxis", () => {
  it("runs from the first dive's month to the end of the last's", () => {
    const axis = timeAxis("2025-12-22T09:00:00", "2026-09-24T09:00:00")
    expect(axis.domain).toEqual([day("2025-12-01"), day("2026-10-01")])
    expect(axis.ticks).toEqual([
      { value: day("2026-01-01"), label: "Jan 2026" },
      { value: day("2026-04-01"), label: "Apr" },
      { value: day("2026-07-01"), label: "Jul" },
    ])
  })

  it("labels years once months would crowd", () => {
    const axis = timeAxis("2019-02-10T09:00:00", "2026-09-24T09:00:00")
    expect(axis.ticks.map((tick) => tick.label)).toEqual([
      "2020",
      "2022",
      "2024",
      "2026",
    ])
  })

  it("names a single month in its middle", () => {
    const axis = timeAxis("2026-07-17T09:00:00", "2026-07-22T09:00:00")
    expect(axis.ticks).toEqual([
      { value: (day("2026-07-01") + day("2026-08-01")) / 2, label: "Jul 2026" },
    ])
  })

  it("leaves the year off within one year", () => {
    const axis = timeAxis("2026-01-14T09:00:00", "2026-09-24T09:00:00", true)
    expect(axis.domain).toEqual([day("2026-01-01"), day("2026-10-01")])
    expect(axis.ticks.map((tick) => tick.label)).toEqual(["Apr", "Jul"])
  })
})
