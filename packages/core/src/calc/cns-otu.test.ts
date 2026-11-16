import { describe, expect, it } from "vitest"

import { fixtureDive, fixtureScubaDives } from "../../test/fixture.ts"
import { subsurfaceFigures } from "../../test/subsurface.ts"
import { cnsSegment, diveCns, diveOtu, otuSegment } from "./cns-otu.ts"
import { diveOxygen } from "./gas.ts"
import { mergeDuplicateSamples } from "./samples.ts"

const salt = { waterType: "salt" } as const

// Expected values from Subsurface's segment arithmetic run in C.
describe("segments", () => {
  it("counts a segment with both ends above 500 mbar", () => {
    expect(cnsSegment(1200, 1400, 60)).toBeCloseTo(0.568112252702, 10)
    expect(otuSegment(1200, 1400, 60)).toBeCloseTo(1.47891385382, 10)
  })

  it("counts only the part above 500 mbar when one end is below", () => {
    // OTU: 48 of the 60 s, from 501 mbar. CNS: the mean, 650 mbar, counts.
    expect(otuSegment(400, 900, 60)).toBeCloseTo(0.365012768692, 10)
    expect(cnsSegment(400, 900, 60)).toBeCloseTo(0.161119210227, 10)
    // An ascent the same way round gives the same figures.
    expect(otuSegment(900, 400, 60)).toBeCloseTo(0.365012768692, 10)
    expect(cnsSegment(900, 400, 60)).toBeCloseTo(0.161119210227, 10)
  })

  it("counts nothing with both ends at or below 500 mbar", () => {
    expect(cnsSegment(300, 450, 60)).toBe(0)
    expect(otuSegment(300, 450, 60)).toBe(0)
    expect(otuSegment(500, 500, 60)).toBe(0)
  })

  it("needs a CNS mean above 500 mbar, truncated", () => {
    expect(cnsSegment(500, 500, 60)).toBe(0)
    // (499 + 502) / 2 = 500.5, truncated to 500
    expect(cnsSegment(499, 502, 60)).toBe(0)
    expect(cnsSegment(500, 502, 60)).toBeCloseTo(0.120695851502, 10)
    expect(cnsSegment(1000, 1001, 60)).toBe(cnsSegment(1000, 1000, 60))
  })

  it("switches to the steeper line above 1500 mbar", () => {
    expect(cnsSegment(1500, 1700, 60)).toBeCloseTo(2.13374520565, 10)
    expect(cnsSegment(1800, 1600, 30)).toBeCloseTo(2.84499288771, 10)
    const below = Math.exp(-11.7853 + 0.00193873 * 1500) * 6000
    expect(cnsSegment(1500, 1500, 60)).toBeCloseTo(below, 12)
  })

  it("treats an end at 500 mbar as 501 for OTU", () => {
    expect(otuSegment(500, 502, 60)).toBeCloseTo(0.00787920852059, 12)
    expect(otuSegment(501, 501, 60)).toBeCloseTo(0.0056345382277, 12)
  })

  it("adds nothing for a zero-length segment", () => {
    expect(cnsSegment(1400, 1400, 0)).toBe(0)
    expect(otuSegment(1400, 1400, 0)).toBe(0)
  })
})

describe("whole dives", () => {
  // Recorded from Subsurface's dive list by the owner, salt water and
  // 1013 mbar. Each is the first dive of its day, so there is no carry-over.
  it.each([
    [63, 15, 41],
    [54, 4, 12],
    [61, 18, 48],
    [36, 1, 0],
  ])("dive %i matches Subsurface: CNS %i, OTU %i", (number, cns, otu) => {
    const dive = fixtureDive(number)
    const samples = mergeDuplicateSamples(dive.samples)
    const oxygen = diveOxygen(dive)!
    expect(Math.round(diveCns(samples, oxygen, salt)!)).toBe(cns)
    expect(diveOtu(samples, oxygen, salt)).toBe(otu)
  })

  it("matches Subsurface's arithmetic on every scuba dive", () => {
    expect(fixtureScubaDives()).toHaveLength(46)
    for (const dive of fixtureScubaDives()) {
      const expected = subsurfaceFigures.find((f) => f.number === dive.number)!
      const samples = mergeDuplicateSamples(dive.samples)
      const oxygen = diveOxygen(dive)!
      expect(diveCns(samples, oxygen, salt), `dive ${dive.number}`).toBeCloseTo(
        expected.cns,
        8
      )
      expect(diveOtu(samples, oxygen, salt), `dive ${dive.number}`).toBe(
        expected.otu
      )
    }
  })

  it("is higher in salt water than fresh, and for nitrox than air", () => {
    const samples = fixtureDive(63).samples
    const fresh = { waterType: "fresh" } as const
    expect(diveCns(samples, 320, fresh)!).toBeLessThan(
      diveCns(samples, 320, salt)!
    )
    expect(diveCns(samples, 209, salt)!).toBeLessThan(
      diveCns(samples, 320, salt)!
    )
  })

  it("has neither figure without samples", () => {
    expect(diveCns([], 320, salt)).toBeNull()
    expect(diveOtu([], 320, salt)).toBeNull()
  })
})
