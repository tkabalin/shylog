import { describe, expect, it } from "vitest"

import { sacTrend, trendChange } from "./trend"
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
