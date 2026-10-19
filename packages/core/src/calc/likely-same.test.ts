import { describe, expect, it } from "vitest"

import { fixtureDive } from "../../test/fixture.ts"
import { likelySame, type ComparableDive } from "./likely-same.ts"

// Fixture dive 63 as the computer has it: 08:12:19, 2500 s, 32.66 m,
// average 21.005 m. Each variant is a hand-logged version of the dive.
const computer: ComparableDive = fixtureDive(63)
const hand = (changes: Partial<ComparableDive>): ComparableDive => ({
  startTime: "2026-07-22T08:12:00",
  duration: 2520,
  maxDepth: 32.7,
  averageDepth: null,
  ...changes,
})

describe("likelySame", () => {
  it("pairs a hand log of fixture dive 63", () => {
    expect(computer).toMatchObject({
      startTime: "2026-07-22T08:12:19",
      duration: 2500,
      maxDepth: 32.66,
      averageDepth: 21.005,
    })
    expect(likelySame(hand({}), computer)).toBe(true)
    expect(likelySame(computer, hand({}))).toBe(true)
  })

  describe("max depth within 1 m or 10 % of the deeper", () => {
    it("passes", () => {
      // 2.84 m apart, under 3.55 m (10 % of 35.5)
      expect(likelySame(hand({ maxDepth: 35.5 }), computer)).toBe(true)
      expect(likelySame(hand({ maxDepth: 30 }), computer)).toBe(true)
    })

    it("fails", () => {
      // 4.34 m apart, over 3.7 m
      expect(likelySame(hand({ maxDepth: 37 }), computer)).toBe(false)
      expect(likelySame(hand({ maxDepth: 29 }), computer)).toBe(false)
    })

    it("allows anything under 1 m on shallow dives", () => {
      const shallow = { ...computer, maxDepth: 3 }
      expect(likelySame(hand({ maxDepth: 3.99 }), shallow)).toBe(true)
      expect(likelySame(hand({ maxDepth: 4 }), shallow)).toBe(false)
    })
  })

  describe("average depth the same way, when both have one", () => {
    it("passes", () => {
      // 1.995 m apart, under 2.3 m
      expect(likelySame(hand({ averageDepth: 23 }), computer)).toBe(true)
    })

    it("fails", () => {
      // 2.995 m apart, over 2.4 m
      expect(likelySame(hand({ averageDepth: 24 }), computer)).toBe(false)
    })

    it("is skipped when either has none", () => {
      expect(likelySame(hand({ averageDepth: null }), computer)).toBe(true)
      expect(
        likelySame(hand({ averageDepth: 5 }), {
          ...computer,
          averageDepth: null,
        })
      ).toBe(true)
    })
  })

  describe("duration within 5 min or 10 % of the longer", () => {
    it("passes", () => {
      // 280 s apart
      expect(likelySame(hand({ duration: 2780 }), computer)).toBe(true)
    })

    it("fails", () => {
      // 400 s apart, over 290 s (10 % of 2900)
      expect(likelySame(hand({ duration: 2900 }), computer)).toBe(false)
    })

    it("needs under 5 min on a short dive", () => {
      const short = { ...computer, duration: 600 }
      expect(likelySame(hand({ duration: 899 }), short)).toBe(true)
      expect(likelySame(hand({ duration: 900 }), short)).toBe(false)
    })

    it("needs a duration on both", () => {
      expect(
        likelySame(hand({ duration: 0 }), { ...computer, duration: 0 })
      ).toBe(false)
    })
  })

  describe("starts within half the longer duration", () => {
    it("passes", () => {
      // Half of 2520 s is 1260 s.
      expect(
        likelySame(hand({ startTime: "2026-07-22T07:51:19" }), computer)
      ).toBe(true)
      expect(
        likelySame(hand({ startTime: "2026-07-22T08:33:19" }), computer)
      ).toBe(true)
    })

    it("fails", () => {
      expect(
        likelySame(hand({ startTime: "2026-07-22T08:33:20" }), computer)
      ).toBe(false)
      expect(
        likelySame(hand({ startTime: "2026-07-21T08:12:19" }), computer)
      ).toBe(false)
    })

    it("allows at least a minute", () => {
      const brief = {
        startTime: "2026-07-22T08:12:19",
        duration: 100,
        maxDepth: 5,
        averageDepth: null,
      }
      expect(
        likelySame({ ...brief, startTime: "2026-07-22T08:13:19" }, brief)
      ).toBe(true)
      expect(
        likelySame({ ...brief, startTime: "2026-07-22T08:13:20" }, brief)
      ).toBe(false)
    })
  })

  it("matches two zero max depths, as Subsurface's similar() does", () => {
    const flat = { ...computer, maxDepth: 0, averageDepth: null }
    expect(likelySame({ ...flat }, flat)).toBe(true)
    expect(likelySame(hand({ maxDepth: 0.5 }), flat)).toBe(false)
  })

  it("compares depths in whole mm", () => {
    const shallow = { ...computer, maxDepth: 3 }
    // 0.9999 m rounds to 1000 mm, which is not under 1 m.
    expect(likelySame(hand({ maxDepth: 3.9999 }), shallow)).toBe(false)
  })
})
