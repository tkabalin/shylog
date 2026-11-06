import { describe, expect, it } from "vitest"

import {
  byFixtureNumber,
  d4iXml,
  syntheticXml,
} from "../../test/uddf-fixtures.ts"
import { readUddf, type ReadDive } from "../uddf/reader.ts"
import { leftOut } from "./freedive.ts"
import { estimateOffsets, planDays, shift } from "./offset.ts"
import type { HandDive } from "./pairing.ts"

const d4i = readUddf(d4iXml)
const fixture = byFixtureNumber(d4iXml, d4i)

// A fixture dive as if logged by hand at its real site time.
const hand = (n: number, over: Partial<HandDive> = {}): HandDive => {
  const { startTime, duration, maxDepth, averageDepth } = fixture(n)
  return {
    id: `dive-${n}`,
    startTime,
    duration,
    maxDepth,
    averageDepth,
    ...over,
  }
}
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)
const scuba = (dives: ReadDive[]) => dives.filter((dive) => !leftOut(dive))

describe("estimateOffsets", () => {
  const abroad = scuba(readUddf(syntheticXml("abroad.uddf")))

  it("finds the D4i five hours behind on the trip and right at home", () => {
    const estimates = estimateOffsets(
      range(51, 66).map((n) => hand(n)),
      abroad
    )
    expect(Object.fromEntries(estimates.offsets)).toEqual({
      "2026-07-04": 0,
      "2026-07-17": 300,
      "2026-07-18": 300,
      "2026-07-19": 300,
      "2026-07-20": 300,
      "2026-07-21": 300,
      "2026-07-22": 300,
      "2026-08-08": 0,
    })
  })

  it("rounds to 15 minutes", () => {
    const late = hand(63, { startTime: shift(fixture(63).startTime, 7) })
    const early = hand(63, { startTime: shift(fixture(63).startTime, -8) })
    expect(estimateOffsets([late], abroad).offsets.get("2026-07-22")).toBe(300)
    expect(estimateOffsets([early], abroad).offsets.get("2026-07-22")).toBe(285)
  })

  it("rounds a half step away from zero, either way", () => {
    // Dive 63 starts at 08:12:19 on the computer.
    const ahead = hand(63, { startTime: "2026-07-22T08:19:49" })
    const behind = hand(63, { startTime: "2026-07-22T08:04:49" })
    expect(
      estimateOffsets([ahead], [fixture(63)]).offsets.get("2026-07-22")
    ).toBe(15)
    expect(
      estimateOffsets([behind], [fixture(63)]).offsets.get("2026-07-22")
    ).toBe(-15)
  })

  it("leaves out a day none of whose hand dives pass the same-dive test", () => {
    const shallow = hand(63, { maxDepth: 5, averageDepth: 3 })
    expect(estimateOffsets([shallow], abroad).offsets.size).toBe(0)
  })

  it("picks the offset that pairs most of the day, the smaller on a tie", () => {
    // Dives 58 to 60 are much alike, so 08:05 against 03:05 alone could
    // also suggest a shift onto dive 59 or 60; only +5:00 pairs all three.
    const day = range(58, 60).map((n) => hand(n))
    expect(estimateOffsets(day, abroad).offsets.get("2026-07-20")).toBe(300)
    const twin = { ...fixture(63), ref: "twin" }
    const later = {
      ...twin,
      ref: "later",
      startTime: shift(twin.startTime, 60),
    }
    expect(
      estimateOffsets([hand(63)], [later, twin]).offsets.get("2026-07-22")
    ).toBe(0)
  })

  it("doesn't count a dive an earlier day paired with", () => {
    // A computer an hour ahead, and dives at 23:30 and 01:00 either side of
    // midnight: the 23:30 dive, read 00:30, would suggest +0:30 for the 23rd.
    const night = [
      { ...fixture(63), ref: "late", startTime: "2026-07-23T00:30:00" },
      { ...fixture(63), ref: "early", startTime: "2026-07-23T02:00:00" },
    ]
    const estimates = estimateOffsets(
      [
        hand(63, { id: "dive-late", startTime: "2026-07-22T23:30:00" }),
        hand(63, { id: "dive-early", startTime: "2026-07-23T01:00:00" }),
      ],
      night
    )
    expect(Object.fromEntries(estimates.offsets)).toEqual({
      "2026-07-22": -60,
      "2026-07-23": -60,
    })
    expect(Object.fromEntries(estimates.claimed)).toEqual({
      late: "2026-07-22",
      early: "2026-07-23",
    })
  })
})

describe("planDays", () => {
  const abroad = readUddf(syntheticXml("abroad.uddf"))

  it("gives a day with no hand dives the nearest estimated day's offset", () => {
    // Nothing logged by hand on the 17th, the trip's first day.
    const hands = [51, ...range(54, 66)].map((n) => hand(n))
    const estimates = estimateOffsets(hands, scuba(abroad))
    expect(estimates.offsets.has("2026-07-17")).toBe(false)
    const { days, dayOf } = planDays(abroad, estimates)
    expect(days.find((day) => day.date === "2026-07-17")?.offset).toBe(300)
    const first = abroad.find(
      (dive) => dive.startTime === "2026-07-17T03:02:44"
    )!
    expect(dayOf.get(first.ref)).toBe("2026-07-17")
  })

  it("puts a night dive starting 23:40 on that date", () => {
    const midnight = readUddf(syntheticXml("midnight.uddf"))
    const logged = hand(63, { startTime: "2026-07-22T23:40:00" })
    const { days, dayOf } = planDays(
      midnight,
      estimateOffsets([logged], midnight)
    )
    expect(days).toEqual([{ date: "2026-07-22", offset: 0 }])
    expect(dayOf.get(midnight[0].ref)).toBe("2026-07-22")
  })

  it("keeps a dive on the site's date when the computer's clock is ahead", () => {
    // Abroad to the west: an evening dive at 20:30 on the 22nd reads
    // 01:30 on the 23rd on a computer five hours ahead.
    const evening = hand(63, { startTime: "2026-07-22T20:30:00" })
    const computer = {
      ...fixture(63),
      ref: "evening",
      startTime: "2026-07-23T01:30:00",
    }
    const estimates = estimateOffsets([evening], [computer])
    expect(Object.fromEntries(estimates.offsets)).toEqual({
      "2026-07-22": -300,
    })
    const { days, dayOf } = planDays([computer], estimates)
    expect(days).toEqual([{ date: "2026-07-22", offset: -300 }])
    expect(dayOf.get("evening")).toBe("2026-07-22")
  })

  it("puts a dive on the day whose hand dives it paired with", () => {
    // Home on the 21st, then a flight seven hours east and a dive at 06:30
    // on the 22nd, which the computer logs at 23:30 on the 21st: shifted by
    // the 21st's offset it lands on the 21st too.
    const home = {
      ...fixture(63),
      ref: "home",
      startTime: "2026-07-21T09:00:00",
    }
    const away = {
      ...fixture(59),
      ref: "away",
      startTime: "2026-07-21T23:30:00",
    }
    const estimates = estimateOffsets(
      [
        hand(63, { startTime: "2026-07-21T09:00:00" }),
        hand(59, { startTime: "2026-07-22T06:30:00" }),
      ],
      [home, away]
    )
    expect(Object.fromEntries(estimates.offsets)).toEqual({
      "2026-07-21": 0,
      "2026-07-22": 420,
    })
    expect(planDays([home, away], estimates).dayOf.get("away")).toBe(
      "2026-07-22"
    )
  })

  it("gives a day with no estimate the offset that put its dive there", () => {
    // Nearest the 11th is the 10th's +10:00, which puts the dive on the
    // 12th, although the 13th is nearer the 12th.
    const dive = { ref: "between", startTime: "2026-07-11T20:00:00" }
    const { days, dayOf } = planDays([dive], {
      offsets: new Map([
        ["2026-07-10", 600],
        ["2026-07-13", 0],
      ]),
      claimed: new Map(),
    })
    expect(dayOf.get("between")).toBe("2026-07-12")
    expect(days).toEqual([{ date: "2026-07-12", offset: 600 }])
  })

  it("leaves every day unshifted when no day can be estimated", () => {
    const { days } = planDays(abroad.slice(0, 2), {
      offsets: new Map(),
      claimed: new Map(),
    })
    expect(days).toEqual([
      { date: "2026-07-04", offset: 0 },
      { date: "2026-07-17", offset: 0 },
    ])
  })
})
