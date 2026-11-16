import { describe, expect, it } from "vitest"

import { fixtureDive, fixtureScubaDives } from "../../test/fixture.ts"
import { subsurfaceFigures } from "../../test/subsurface.ts"
import { diveCns } from "./cns-otu.ts"
import { diveOxygen } from "./gas.ts"
import { previousDiveFigures, type LoggedDive } from "./previous-dives.ts"
import { diveEnd, mergeDuplicateSamples } from "./samples.ts"

const salt = { waterType: "salt" } as const

const dive = (
  startTime: string,
  cns: number | null = 0,
  end = 3600,
  tripId: string | null = null
): LoggedDive => ({ startTime, end, tripId, cns })

// The figures of the last dive written.
const last = (dives: LoggedDive[]) => previousDiveFigures(dives).at(-1)!
const intervalAt = (startTime: string, dives: LoggedDive[]) =>
  last([...dives, dive(startTime)]).surfaceInterval
const cnsOf = (dives: LoggedDive[]) => last(dives).cns

const fixture = (number: number) => {
  const each = fixtureDive(number)
  const samples = mergeDuplicateSamples(each.samples)
  return dive(
    each.startTime,
    diveCns(samples, diveOxygen(each)!, salt),
    diveEnd(each.duration, samples)
  )
}

describe("fixture dives", () => {
  it("dive 2 follows dive 1 the same morning", () => {
    // Dive 1 starts at 11:01:29 and its last sample below 0.75 m is at
    // 2111 s, later than its 2040 s duration, so it ends at 11:36:40.
    expect(last([fixture(1), fixture(2)]).surfaceInterval).toBe(600)
  })

  it("dive 8 is 47 days after dive 7, so has no previous dive", () => {
    expect(last([fixture(7), fixture(8)]).surfaceInterval).toBe("none")
  })

  it("dive 1 has no earlier dive", () => {
    const [first] = previousDiveFigures([fixture(1), fixture(2)])
    expect(first.surfaceInterval).toBe("none")
  })

  it("matches Subsurface's calculate_cns on every scuba dive", () => {
    const dives = fixtureScubaDives().map((each) => fixture(each.number))
    const figures = previousDiveFigures(dives)
    fixtureScubaDives().forEach((each, i) => {
      const expected = subsurfaceFigures.find((f) => f.number === each.number)!
      expect(figures[i].cns, `dive ${each.number}`).toBe(expected.carried)
    })
  })

  it("carries the three dives of 20 July 2026 forward", () => {
    // Dive 58 (EANx32) 15.6 %, 75 min at the surface, dive 59 adds 1.3 %,
    // 61 min at the surface, then dive 60 adds 0.04 %.
    const chain = [58, 59, 60].map(fixture)
    expect(previousDiveFigures(chain).map((each) => each.cns)).toEqual([
      16, 10, 6,
    ])
  })
})

describe("surface interval", () => {
  it("is 0 when the previous dive was still going", () => {
    const dives = [dive("2026-07-20T08:00:00"), dive("2026-07-20T08:30:00")]
    expect(intervalAt("2026-07-20T08:30:00", dives)).toBe(0)
    // Ending exactly at the start is also 0.
    expect(intervalAt("2026-07-20T09:00:00", dives.slice(0, 1))).toBe(0)
  })

  it("measures from the dive that started most recently, as Subsurface does", () => {
    // A long dive runs until 12:00; a short one from 09:00 ends at 09:30.
    const dives = [
      dive("2026-07-20T08:00:00", 0, 4 * 3600),
      dive("2026-07-20T09:00:00", 0, 1800),
    ]
    expect(intervalAt("2026-07-20T11:00:00", dives)).toBe(5400)
  })

  it("caps at 48 hours", () => {
    const dives = [dive("2026-07-20T08:00:00")]
    // The dive ends at 09:00.
    expect(intervalAt("2026-07-22T09:00:00", dives)).toBe(48 * 3600)
    expect(intervalAt("2026-07-22T09:00:01", dives)).toBe("none")
  })

  it("ignores dives starting at the same time or later", () => {
    const dives = [dive("2026-07-20T08:00:00"), dive("2026-07-20T10:00:00")]
    expect(intervalAt("2026-07-20T08:00:00", dives)).toBe("none")
  })

  it("takes the later-written of two dives that start together", () => {
    const dives = [
      dive("2026-07-20T08:00:00", 0, 1800),
      dive("2026-07-20T08:00:00", 0, 3600),
    ]
    expect(intervalAt("2026-07-20T10:00:00", dives)).toBe(3600)
    expect(intervalAt("2026-07-20T10:00:00", dives.toReversed())).toBe(5400)
  })

  it("does not depend on the order of dives with different starts", () => {
    const dives = [
      dive("2026-07-20T12:00:00"),
      dive("2026-07-20T08:00:00"),
      dive("2026-07-20T10:00:00", 0, 1800),
    ]
    expect(previousDiveFigures(dives)[0].surfaceInterval).toBe(5400)
  })

  it("counts across midnight", () => {
    const dives = [dive("2026-07-20T22:30:00")]
    expect(intervalAt("2026-07-21T00:15:00", dives)).toBe(45 * 60)
  })

  it("is measured within the whole log, trips or not", () => {
    const dives = [
      dive("2026-07-20T08:00:00", 0, 3600, "trip-a"),
      dive("2026-07-20T10:00:00", 0, 3600, "trip-b"),
    ]
    expect(last(dives).surfaceInterval).toBe(3600)
  })
})

describe("CNS carry-over", () => {
  it("halves the total every 90 minutes at the surface", () => {
    const first = dive("2026-07-20T08:00:00", 40)
    // The first ends at 09:00.
    const after = (time: string) => cnsOf([first, dive(time, 0)])
    expect(after("2026-07-20T10:30:00")).toBe(20)
    expect(after("2026-07-20T12:00:00")).toBe(10)
    expect(after("2026-07-20T09:45:00")).toBe(28)
  })

  it("resets after 12 hours at the surface", () => {
    const first = dive("2026-07-20T08:00:00", 40)
    // Ends at 09:00, so exactly 12 hours later still counts, and a second
    // more does not. 2^-8 of 40 % is 0.16 %.
    expect(cnsOf([first, dive("2026-07-20T21:00:00", 1)])).toBe(1)
    expect(cnsOf([first, dive("2026-07-20T21:00:00", 0.4)])).toBe(1)
    expect(cnsOf([first, dive("2026-07-20T21:00:01", 0.4)])).toBe(0)
  })

  it("follows a chain of dives each within 12 hours of the next", () => {
    // The first ends 23 hours before the last starts, but each gap is 11
    // hours, so it still counts: 20 000 % halved over 22 hours is 0.77 %.
    const first = dive("2026-07-20T08:00:00", 20000)
    const middle = dive("2026-07-20T20:00:00", 0)
    const final = dive("2026-07-21T08:00:00", 0.4)
    expect(cnsOf([first, middle, final])).toBe(1)
    expect(cnsOf([first, final])).toBe(0)
  })

  it("counts earlier dives without samples as nothing, but times from them", () => {
    const dives = [
      dive("2026-07-20T08:00:00", 40),
      dive("2026-07-20T10:00:00", null),
      dive("2026-07-20T12:30:00", 0),
    ]
    // 40 % halved over 1 h, then 1.5 h: the null dive adds nothing.
    expect(cnsOf(dives)).toBe(
      Math.round(40 * 2 ** (-60 / 90) * 2 ** (-90 / 90))
    )
  })

  it("has no figure for a dive without samples, in a trip or not", () => {
    const first = dive("2026-07-20T08:00:00", 40, 3600, "trip-a")
    expect(cnsOf([first, dive("2026-07-20T10:00:00", null)])).toBeNull()
    expect(
      cnsOf([first, dive("2026-07-20T10:00:00", null, 3600, "trip-a")])
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
    expect(cnsOf(dives)).toBe(Math.round(40 * 2 ** (-210 / 90)))
  })

  it("counts every earlier dive for a dive in no trip", () => {
    const dives = [
      dive("2026-07-20T08:00:00", 40, 3600, "trip-a"),
      dive("2026-07-20T12:30:00", 0, 3600, null),
    ]
    expect(cnsOf(dives)).toBe(Math.round(40 * 2 ** (-210 / 90)))
  })

  it("leaves out dives at the same start and later ones", () => {
    const dives = [
      dive("2026-07-20T08:00:00", 40),
      dive("2026-07-20T08:00:00", 5),
      dive("2026-07-20T09:00:00", 40),
    ]
    expect(previousDiveFigures(dives)[1].cns).toBe(5)
  })

  it("walks dives that start together in the order written", () => {
    // The second overlaps the first, so it grows the first's 40 % before
    // adding its own; the other way round, the 40 % comes last and is kept.
    const first = dive("2026-07-20T08:00:00", 40)
    const second = dive("2026-07-20T08:00:00", 0)
    const later = dive("2026-07-20T09:00:00", 0)
    expect(cnsOf([first, second, later])).toBe(Math.round(40 * 2 ** (60 / 90)))
    expect(cnsOf([second, first, later])).toBe(40)
  })

  it("stops at the later-written of dives starting together, as Subsurface does", () => {
    // Both start at 08:00; the long one ends at 22:00, the short one at
    // 08:00, over 12 hours before 20:01. Only the later-written counts.
    const long = dive("2026-07-20T08:00:00", 40, 14 * 3600)
    const short = dive("2026-07-20T08:00:00", 40, 0)
    const next = dive("2026-07-20T20:01:00", 0)
    expect(cnsOf([long, short, next])).toBe(0)
    // The other way round, both carry over, growing while the long one runs.
    expect(cnsOf([short, long, next])).toBe(Math.round(80 * 2 ** (119 / 90)))
  })

  it("does not depend on the order of dives with different starts", () => {
    const dives = [
      dive("2026-07-20T12:30:00", 0),
      dive("2026-07-20T08:00:00", 40),
      dive("2026-07-20T10:00:00", 20),
    ]
    const expected = Math.round((40 * 2 ** (-60 / 90) + 20) * 2 ** (-90 / 90))
    expect(previousDiveFigures(dives)[0].cns).toBe(expected)
    expect(previousDiveFigures(dives.toReversed())[2].cns).toBe(expected)
  })

  it("grows the total for an overlapping dive, as Subsurface does", () => {
    // The first runs until 10:00, past the second's start.
    const first = dive("2026-07-20T08:00:00", 40, 7200)
    expect(cnsOf([first, dive("2026-07-20T09:30:00", 0)])).toBe(
      Math.round(40 * 2 ** (30 / 90))
    )
  })

  it("rounds a half to even, as Subsurface's lrint does", () => {
    expect(cnsOf([dive("2026-07-20T08:00:00", 2.5)])).toBe(2)
    expect(cnsOf([dive("2026-07-20T08:00:00", 3.5)])).toBe(4)
  })

  it("caps the figure at 999 %, past which only wrong data goes", () => {
    // Nitrox 100 % typed on a 50 m dive: CNS passes what SQLite can store.
    const deep = [
      { time: 0, depth: 50, temperature: null, pressure: null },
      { time: 2400, depth: 50, temperature: null, pressure: null },
    ]
    const own = diveCns(deep, 1000, salt)!
    expect(own).toBeGreaterThan(2 ** 63)
    expect(cnsOf([dive("2026-07-20T08:00:00", own)])).toBe(999)
    // Carried over too, from two dives below the cap.
    const first = dive("2026-07-20T08:00:00", 900)
    expect(cnsOf([first, dive("2026-07-20T09:00:00", 900)])).toBe(999)
  })
})

describe("previousDiveFigures", () => {
  it("gives the figures in the order the dives came in", () => {
    const dives = [
      dive("2026-07-20T12:00:00", 0, 1800, "trip-a"),
      dive("2026-07-20T08:00:00", 40, 3600, "trip-a"),
      dive("2026-07-20T10:00:00", 20, 1800),
    ]
    expect(previousDiveFigures(dives)).toEqual([
      // Back to the trip's 08:00 dive, 3 h after it ended.
      { surfaceInterval: 5400, cns: Math.round(40 * 2 ** (-180 / 90)) },
      { surfaceInterval: "none", cns: 40 },
      {
        surfaceInterval: 3600,
        cns: Math.round(40 * 2 ** (-60 / 90) + 20),
      },
    ])
  })

  it("gives nothing for an empty log", () => {
    expect(previousDiveFigures([])).toEqual([])
  })
})
