import { describe, expect, it } from "vitest"

import { mod } from "./mod.ts"
import { bestMix, navyNoStopTime, noStopTime } from "./ndl.ts"

const salt = { waterType: "salt" } as const
const gf85 = { low: 30, high: 85 }
const minutes = (seconds: number | null) =>
  seconds === null ? null : Math.floor(seconds / 60)

describe("noStopTime", () => {
  // Pinned from Subsurface's planner in Recreational mode (the reference
  // test checks every other input against its code).
  it("EAN32 at 30 m on GF 30/85: 23 min 40 s, the descent included", () => {
    expect(noStopTime(320, 30_000, gf85, salt)).toBe(1420)
  })

  it("air at 30 m: 14 min on GF 85, 10 on GF 70, 19 on GF 100", () => {
    expect(minutes(noStopTime(209, 30_000, gf85, salt))).toBe(14)
    expect(minutes(noStopTime(209, 30_000, { low: 30, high: 70 }, salt))).toBe(
      10
    )
    expect(minutes(noStopTime(209, 30_000, { low: 30, high: 100 }, salt))).toBe(
      19
    )
  })

  it("falls with depth and rises with oxygen", () => {
    const air = [12, 18, 24, 30, 40].map((m) =>
      noStopTime(209, m * 1000, gf85, salt)
    )
    expect(air).toEqual([...air].sort((a, b) => b! - a!))
    expect(noStopTime(320, 24_000, gf85, salt)!).toBeGreaterThan(
      noStopTime(209, 24_000, gf85, salt)!
    )
  })

  it("is null past the planner's 6 hours", () => {
    expect(noStopTime(209, 6000, gf85, salt)).toBeNull()
    expect(noStopTime(320, 12_000, gf85, salt)).toBeNull()
  })
})

describe("navyNoStopTime", () => {
  it("reads air at the exact or next deeper row", () => {
    // 18 m is 59.1 fsw, so the 60 fsw row.
    expect(navyNoStopTime(209, 18_000)).toBe(63)
    // 30.48 m is exactly 100 fsw.
    expect(navyNoStopTime(209, 30_480)).toBe(25)
    expect(navyNoStopTime(209, 30_500)).toBe(20)
  })

  it("has no limit to 20 fsw and none past 190", () => {
    expect(navyNoStopTime(209, 6000)).toBeNull()
    // 57.9 m is 189.96 fsw, and 58 m is 190.3.
    expect(navyNoStopTime(209, 57_900)).toBe(5)
    expect(navyNoStopTime(209, 58_000)).toBe(0)
  })

  it("reads nitrox at its equivalent air depth", () => {
    // EAN32 at 30 m: (98.4 + 33) × 0.68 / 0.79 − 33 = 80.1 fsw, so 90.
    expect(navyNoStopTime(320, 30_000)).toBe(33)
    // The manual's own example: EAN40 at 70 fsw is 45.6 fsw, so 50.
    expect(navyNoStopTime(400, 70 * 304.8)).toBe(92)
  })
})

describe("bestMix", () => {
  it("35 m at 1.4 bar is 30.7 %", () => {
    expect(bestMix(35_000, 1.4, salt)).toBe(307)
  })

  it("never passes 100 %", () => {
    expect(bestMix(0, 1.6, salt)).toBe(1000)
  })

  // Rounding the mix down keeps its MOD at or past the depth, even after
  // the MOD's own rounding to 0.1 m.
  it("has an MOD at or past every whole depth", () => {
    for (const limit of [1.2, 1.3, 1.4, 1.5, 1.6]) {
      for (let depth = 1; depth <= 60; depth++) {
        const mix = bestMix(depth * 1000, limit, salt)
        if (mix < 1000)
          expect(mod(mix, limit, salt)).toBeGreaterThanOrEqual(depth)
      }
    }
  })
})
