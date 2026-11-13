// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"

import type { LogView } from "@/data/log"

import { statistics } from "./figures"
import { anniversary, descended, landmarks, streaks } from "./records"
import { seededLog } from "./seeded-log"
import { dive } from "./synthetic"

const today = "2026-10-19"

describe("records on the seeded fixture, all time", () => {
  let log: LogView
  let records: ReturnType<typeof statistics>["records"]
  beforeAll(async () => {
    log = await seededLog()
    records = statistics(log, undefined, today).records
  })

  it("names the coldest dive, fixture dive 72 at 12 °C", () => {
    expect(records.coldest?.dive.startTime).toBe("2026-09-24T11:23:46")
    expect(records.coldest?.value).toBe(12)
  })

  // Dive 2 is 25 °C too, and dive 5's maximum of 29 °C is the highest.
  it("names the warmest dive by its minimum, the earlier of a tie", () => {
    expect(records.warmest?.dive.startTime).toBe("2019-02-10T11:01:29")
    expect(records.warmest?.value).toBe(25)
  })

  it("words the depth descended against the ladder", () => {
    expect(records.descended).toEqual({
      metres: 735.87,
      headline: "You've descended Lion's Head",
      progress: "89% of the way to the Burj Khalifa",
      fraction: 735.87 / 828,
    })
  })

  it("finds the longest day and week streaks", () => {
    expect(records.days).toEqual({
      length: 6,
      first: "2026-07-17",
      last: "2026-07-22",
      running: false,
    })
    expect(records.weeks).toEqual({
      length: 4,
      first: "2026-04-04",
      last: "2026-04-25",
      running: false,
    })
  })

  it("counts the anniversary from the first dive whatever the year", () => {
    const expected = { first: "2019-02-10", years: 7, months: 92 }
    expect(records.anniversary).toMatchObject(expected)
    expect(statistics(log, "2025", today).records.anniversary).toMatchObject(
      expected
    )
  })
})

describe("descended", () => {
  it("is a share of the first rung below it", () => {
    expect(descended(28)).toEqual({
      headline: "You've descended 50% of the Leaning Tower of Pisa",
      progress: null,
      fraction: 0.5,
    })
  })

  it("names a rung it lands on exactly", () => {
    expect(descended(669).headline).toBe("You've descended Lion's Head")
  })

  it("says twice and 3 times when a gap is wide", () => {
    expect(descended(50_000)).toEqual({
      headline: "You've descended Olympus Mons twice",
      progress: "50% of the way to the Kármán line",
      fraction: 0.5,
    })
    expect(descended(70_000).headline).toBe(
      "You've descended Olympus Mons 3 times"
    )
  })

  it("keeps something ahead past the last rung", () => {
    expect(descended(250_000)).toEqual({
      headline: "You've descended the Kármán line twice",
      progress: "50% of the way to 3 times",
      fraction: 0.5,
    })
  })

  it("never says 100 % before the rung", () => {
    expect(descended(827.9).progress).toBe("99% of the way to the Burj Khalifa")
    expect(descended(827.9).fraction).toBeLessThan(1)
  })

  it("has a strictly ascending ladder", () => {
    for (let i = 1; i < landmarks.length; i++)
      expect(landmarks[i]!.height).toBeGreaterThan(landmarks[i - 1]!.height)
  })
})

describe("streaks", () => {
  const on = (...days: string[]) =>
    days.map((day) => dive({ startTime: `${day}T09:00:00` }))

  it("counts two dives on one day once", () => {
    const dives = [...on("2026-03-01", "2026-03-02"), ...on("2026-03-02")]
    expect(streaks(dives, today).days?.length).toBe(2)
  })

  it("keeps the earlier of two equal streaks", () => {
    const dives = on("2026-03-01", "2026-03-02", "2026-05-01", "2026-05-02")
    expect(streaks(dives, today).days).toMatchObject({ first: "2026-03-01" })
  })

  it("runs weeks Monday to Sunday", () => {
    // Sunday 1 March, then Monday 2 March starts the next week.
    const dives = on("2026-03-01", "2026-03-02", "2026-03-17")
    expect(streaks(dives, today).weeks).toMatchObject({
      length: 2,
      first: "2026-03-01",
      last: "2026-03-02",
    })
  })

  it("marks a streak that can still grow as running", () => {
    expect(streaks(on("2026-10-17", "2026-10-18"), today).days?.running).toBe(
      true
    )
    expect(streaks(on("2026-10-16", "2026-10-17"), today).days?.running).toBe(
      false
    )
    // Last week (12 to 18 October) still runs into this one.
    expect(streaks(on("2026-10-12"), today).weeks?.running).toBe(true)
    expect(streaks(on("2026-10-11"), today).weeks?.running).toBe(false)
  })
})

describe("anniversary", () => {
  const first = [dive({ startTime: "2019-02-10T11:01:29" })]

  it("says today on the day itself", () => {
    expect(anniversary(first, "2026-02-10")).toMatchObject({
      years: 7,
      onTheDay: true,
    })
    expect(anniversary(first, "2026-02-09")).toMatchObject({
      years: 6,
      onTheDay: false,
    })
  })

  it("counts months under a year", () => {
    expect(anniversary(first, "2019-07-09")).toMatchObject({
      years: 0,
      months: 4,
      onTheDay: false,
    })
  })

  it("is none for an empty log", () => {
    expect(anniversary([], today)).toBeNull()
  })
})
