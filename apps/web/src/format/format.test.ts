import { describe, expect, it } from "vitest"

import {
  ago,
  cardDay,
  clockTime,
  deletedDay,
  deletedGroup,
  instant,
  longDate,
  monthKey,
  monthLabel,
} from "./dates"
import {
  depth,
  gasDetail,
  gasName,
  hours,
  interval,
  litres,
  minutes,
  temperatureRange,
} from "./figures"

describe("dates", () => {
  it("gives a card its weekday and day only", () => {
    expect(cardDay("2026-07-25T09:12:00")).toBe("Sat 25")
    expect(cardDay("2026-10-10T23:59:59")).toBe("Sat 10")
  })

  it("heads a month group with the month and year", () => {
    expect(monthLabel("2026-07-22T08:12:19")).toBe("July 2026")
    expect(monthKey("2026-07-22T08:12:19")).toBe("2026-07")
  })

  it("gives the detail the full date and the local clock time", () => {
    expect(longDate("2026-07-25T09:12:00")).toBe("Sat 25 Jul 2026")
    expect(longDate("2026-09-24T09:12:00")).toBe("Thu 24 Sep 2026")
    expect(clockTime("2026-07-25T09:12:00")).toBe("09:12")
  })

  it("never moves a dive to another day in another time zone", () => {
    // Just after midnight local time at the site, wherever the phone is.
    expect(cardDay("2026-01-01T00:05:00")).toBe("Thu 1")
    expect(cardDay("2025-12-31T23:55:00")).toBe("Wed 31")
  })

  // Built from the phone's own zone, as the server's instants are read.
  const at = (...parts: [number, number, number, number?]) =>
    new Date(parts[0], parts[1] - 1, parts[2], parts[3] ?? 12).toISOString()

  it("groups deleted dives by today, yesterday, then month", () => {
    const now = new Date(2026, 9, 29, 9)
    expect(deletedGroup(at(2026, 10, 29, 0), now)).toBe("Deleted today")
    expect(deletedGroup(at(2026, 10, 28, 23), now)).toBe("Deleted yesterday")
    expect(deletedGroup(at(2026, 10, 2), now)).toBe("Deleted in October")
    expect(deletedGroup(at(2026, 8, 2), now)).toBe("Deleted in August")
    expect(deletedGroup(at(2025, 12, 31), now)).toBe("Deleted in December 2025")
    // Yesterday across the turn of a month.
    expect(deletedGroup(at(2026, 10, 31), new Date(2026, 10, 1, 8))).toBe(
      "Deleted yesterday"
    )
  })

  it("gives backup times as today, yesterday or a date", () => {
    const now = new Date(2026, 9, 29, 9)
    expect(instant(at(2026, 10, 29, 2), now)).toBe("Today 02:00")
    expect(instant(at(2026, 10, 28, 2), now)).toBe("Yesterday 02:00")
    expect(instant(at(2026, 8, 2), now)).toBe("2 Aug")
    expect(instant(at(2025, 8, 2), now)).toBe("2 Aug 2025")
  })

  it("says how long ago the last sync was", () => {
    const now = new Date(2026, 9, 29, 9)
    const before = (minutes: number) =>
      new Date(now.getTime() - minutes * 60_000).toISOString()
    expect(ago(before(0.5), now)).toBe("just now")
    expect(ago(before(2), now)).toBe("2 min ago")
    expect(ago(before(180), now)).toBe("3 h ago")
    expect(ago(at(2026, 10, 27, 9), now)).toBe("27 Oct")
  })

  it("dates a deleted dive's pill by day and month", () => {
    expect(deletedDay(at(2026, 8, 2))).toBe("2 Aug")
  })
})

describe("figures", () => {
  it("shows depth to one decimal", () => {
    expect(depth(32.66)).toBe("32.7")
    expect(depth(18)).toBe("18.0")
  })

  it("shows duration in whole minutes", () => {
    expect(minutes(2500)).toBe("42")
    expect(minutes(1830)).toBe("31")
    expect(minutes(180)).toBe("3")
  })

  it("adds up hours underwater", () => {
    expect(hours(137_000)).toBe("38")
  })

  it("shows a surface interval in hours and minutes", () => {
    expect(interval(7800)).toBe("2 h 10 min")
    expect(interval(2700)).toBe("45 min")
    expect(interval(3600)).toBe("1 h 0 min")
  })

  it("shows a temperature range, or one value when they match", () => {
    expect(temperatureRange(22, 24)).toBe("22\u00a0–\u00a024")
    expect(temperatureRange(21.5, 21.5)).toBe("21.5")
    expect(temperatureRange(null, 24)).toBe("24")
    expect(temperatureRange(null, null)).toBeNull()
    expect(temperatureRange(-1.9, 2)).toBe("−1.9\u00a0–\u00a02")
  })

  it("names the gas", () => {
    expect(gasName(null)).toBe("Air")
    expect(gasName(320)).toBe("EANx32")
    expect(gasName(324)).toBe("EANx32.4")
    expect(gasDetail(320)).toBe("Nitrox 32.0%")
  })

  it("shows cylinder volume in litres", () => {
    expect(litres(11100)).toBe("11.1")
    expect(litres(12000)).toBe("12")
  })
})
