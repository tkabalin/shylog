import { describe, expect, it } from "vitest"

import { fixtureDive, fixtureScubaDives } from "../../test/fixture.ts"
import { subsurfaceFigures } from "../../test/subsurface.ts"
import {
  cnsSegment,
  cnsWithCarryOver,
  diveCns,
  diveOtu,
  otuSegment,
  type CnsDive,
} from "./cns-otu.ts"
import { diveOxygen } from "./gas.ts"
import { diveEnd, mergeDuplicateSamples } from "./samples.ts"

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

const dive = (
  startTime: string,
  cns: number | null,
  end = 3600,
  tripId: string | null = null
): CnsDive => ({ startTime, end, tripId, cns })

describe("carry-over", () => {
  it("matches Subsurface's calculate_cns on every scuba dive", () => {
    const dives = fixtureScubaDives().map((fixture) => {
      const samples = mergeDuplicateSamples(fixture.samples)
      return {
        number: fixture.number,
        ...dive(
          fixture.startTime,
          diveCns(samples, diveOxygen(fixture)!, salt),
          diveEnd(fixture.duration, samples)
        ),
      }
    })
    for (const each of dives) {
      const expected = subsurfaceFigures.find((f) => f.number === each.number)!
      expect(cnsWithCarryOver(each, dives), `dive ${each.number}`).toBe(
        expected.carried
      )
    }
  })

  it("carries the three dives of 20 July 2026 forward", () => {
    // Dive 58 (EANx32) 15.6 %, 75 min at the surface, dive 59 adds 1.3 %,
    // 61 min at the surface, then dive 60 adds 0.04 %.
    const chain = [58, 59, 60].map((number) => {
      const fixture = fixtureDive(number)
      const samples = mergeDuplicateSamples(fixture.samples)
      return dive(
        fixture.startTime,
        diveCns(samples, diveOxygen(fixture)!, salt),
        diveEnd(fixture.duration, samples)
      )
    })
    expect(chain.map((each) => cnsWithCarryOver(each, chain))).toEqual([
      16, 10, 6,
    ])
  })

  it("halves the total every 90 minutes at the surface", () => {
    const first = dive("2026-07-20T08:00:00", 40)
    // The first ends at 09:00.
    const after = (time: string) => cnsWithCarryOver(dive(time, 0), [first])
    expect(after("2026-07-20T10:30:00")).toBe(20)
    expect(after("2026-07-20T12:00:00")).toBe(10)
    expect(after("2026-07-20T09:45:00")).toBe(28)
  })

  it("resets after 12 hours at the surface", () => {
    const first = dive("2026-07-20T08:00:00", 40)
    // Ends at 09:00, so exactly 12 hours later still counts, and a second
    // more does not. 2^-8 of 40 % is 0.16 %.
    const at = (time: string) => cnsWithCarryOver(dive(time, 1), [first])
    expect(at("2026-07-20T21:00:00")).toBe(1)
    expect(cnsWithCarryOver(dive("2026-07-20T21:00:00", 0.4), [first])).toBe(1)
    expect(cnsWithCarryOver(dive("2026-07-20T21:00:01", 0.4), [first])).toBe(0)
  })

  it("follows a chain of dives each within 12 hours of the next", () => {
    // The first ends 23 hours before the last starts, but each gap is 11
    // hours, so it still counts: 20 000 % halved over 22 hours is 0.77 %.
    const first = dive("2026-07-20T08:00:00", 20000)
    const middle = dive("2026-07-20T20:00:00", 0)
    const last = dive("2026-07-21T08:00:00", 0.4)
    expect(cnsWithCarryOver(last, [first, middle, last])).toBe(1)
    expect(cnsWithCarryOver(last, [first, last])).toBe(0)
  })

  it("counts earlier dives without samples as nothing, but times from them", () => {
    const dives = [
      dive("2026-07-20T08:00:00", 40),
      dive("2026-07-20T10:00:00", null),
      dive("2026-07-20T12:30:00", 0),
    ]
    // 40 % halved over 1 h, then 1.5 h: the null dive adds nothing.
    expect(cnsWithCarryOver(dives[2], dives)).toBe(
      Math.round(40 * 2 ** (-60 / 90) * 2 ** (-90 / 90))
    )
  })

  it("has no figure for a dive without samples", () => {
    const dives = [dive("2026-07-20T08:00:00", 40)]
    expect(
      cnsWithCarryOver(dive("2026-07-20T10:00:00", null), dives)
    ).toBeNull()
  })

  it("skips dives in other trips, and dives in no trip, for a trip dive", () => {
    const dives = [
      dive("2026-07-20T08:00:00", 40, 3600, "trip-a"),
      dive("2026-07-20T09:30:00", 40, 3600, "trip-b"),
      dive("2026-07-20T11:00:00", 40, 3600, null),
      dive("2026-07-20T12:30:00", 0, 3600, "trip-a"),
    ]
    // Only the first: 40 % halved over 3.5 h.
    expect(cnsWithCarryOver(dives[3], dives)).toBe(
      Math.round(40 * 2 ** (-210 / 90))
    )
  })

  it("counts every earlier dive for a dive in no trip", () => {
    const dives = [
      dive("2026-07-20T08:00:00", 40, 3600, "trip-a"),
      dive("2026-07-20T12:30:00", 0, 3600, null),
    ]
    expect(cnsWithCarryOver(dives[1], dives)).toBe(
      Math.round(40 * 2 ** (-210 / 90))
    )
  })

  it("leaves out dives at the same start and later ones", () => {
    const dives = [
      dive("2026-07-20T08:00:00", 40),
      dive("2026-07-20T08:00:00", 5),
      dive("2026-07-20T09:00:00", 40),
    ]
    expect(cnsWithCarryOver(dives[1], dives)).toBe(5)
  })

  it("walks dives that start together in the order written", () => {
    // The second overlaps the first, so it grows the first's 40 % before
    // adding its own; the other way round, the 40 % comes last and is kept.
    const first = dive("2026-07-20T08:00:00", 40)
    const second = dive("2026-07-20T08:00:00", 0)
    const later = dive("2026-07-20T09:00:00", 0)
    expect(cnsWithCarryOver(later, [first, second, later])).toBe(
      Math.round(40 * 2 ** (60 / 90))
    )
    expect(cnsWithCarryOver(later, [second, first, later])).toBe(40)
  })

  it("does not depend on the order of dives with different starts", () => {
    const dives = [
      dive("2026-07-20T12:30:00", 0),
      dive("2026-07-20T08:00:00", 40),
      dive("2026-07-20T10:00:00", 20),
    ]
    expect(cnsWithCarryOver(dives[0], dives)).toBe(
      cnsWithCarryOver(dives[0], [...dives].reverse())
    )
    expect(cnsWithCarryOver(dives[0], dives)).toBe(
      Math.round((40 * 2 ** (-60 / 90) + 20) * 2 ** (-90 / 90))
    )
  })

  it("grows the total for an overlapping dive, as Subsurface does", () => {
    // The first runs until 10:00, past the second's start.
    const first = dive("2026-07-20T08:00:00", 40, 7200)
    expect(cnsWithCarryOver(dive("2026-07-20T09:30:00", 0), [first])).toBe(
      Math.round(40 * 2 ** (30 / 90))
    )
  })
})
