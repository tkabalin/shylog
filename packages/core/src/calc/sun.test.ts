import { describe, expect, it } from "vitest"

import { countrySunTimes, diveDark, sunTimes } from "./sun.ts"

// Within two minutes of a published time, given as minutes after midnight.
const near = (minutes: number, hh: number, mm: number) =>
  expect(Math.abs(minutes - (hh * 60 + mm))).toBeLessThanOrEqual(2)

describe("sunTimes", () => {
  // Published times for each place and date, on its local clocks.
  it.each([
    {
      place: "London midsummer",
      date: "2026-06-21",
      at: [51.507, -0.128, "Europe/London"],
      rise: [4, 43],
      set: [21, 21],
    },
    {
      place: "New York midwinter",
      date: "2026-12-21",
      at: [40.713, -74.006, "America/New_York"],
      rise: [7, 17],
      set: [16, 32],
    },
    {
      place: "Cape Town midwinter",
      date: "2026-06-21",
      at: [-33.925, 18.424, "Africa/Johannesburg"],
      rise: [7, 51],
      set: [17, 44],
    },
    {
      place: "Johannesburg midwinter",
      date: "2026-06-21",
      at: [-26.25, 28, "Africa/Johannesburg"],
      rise: [6, 54],
      set: [17, 25],
    },
  ] as const)("$place", ({ date, at: [lat, lon, zone], rise, set }) => {
    const sun = sunTimes(date, lat, lon, zone)
    near(sun.rise, rise[0], rise[1])
    near(sun.set, set[0], set[1])
  })

  it("counts a sunset after midnight past 24:00", () => {
    // Reykjavik's midsummer sun sets a few minutes into the next day.
    const sun = sunTimes("2026-06-21", 64.147, -21.942, "Atlantic/Reykjavik")
    expect(sun.set).toBeGreaterThan(24 * 60)
    expect(sun.set).toBeLessThan(24 * 60 + 15)
  })

  it("finds the right day on a clock far from solar time", () => {
    // Tonga's UTC+13 is west of 180°, so a UTC day's noon is its next day.
    const sun = sunTimes("2026-07-01", -21.13, -175.2, "Pacific/Tongatapu")
    expect(sun.rise).toBeGreaterThan(6 * 60)
    expect(sun.rise).toBeLessThan(8 * 60)
    expect(sun.set).toBeGreaterThan(17 * 60)
    expect(sun.set).toBeLessThan(19 * 60)
  })

  it("refuses a date the zone skipped", () => {
    // Samoa jumped from 29 to 31 December 2011 across the date line.
    expect(() =>
      sunTimes("2011-12-30", -13.83, -171.73, "Pacific/Apia")
    ).toThrow(RangeError)
  })

  it("handles polar night and the midnight sun", () => {
    expect(sunTimes("2026-12-21", 69.65, 18.96, "Europe/Oslo")).toEqual({
      rise: Infinity,
      set: -Infinity,
    })
    expect(sunTimes("2026-06-21", 69.65, 18.96, "Europe/Oslo")).toEqual({
      rise: -Infinity,
      set: Infinity,
    })
  })
})

describe("countrySunTimes", () => {
  it("uses the one clock's city for a single-zone country", () => {
    expect(countrySunTimes("2026-06-21", "ZA")).toEqual(
      sunTimes("2026-06-21", -26.25, 28, "Africa/Johannesburg")
    )
  })

  it("takes the city with the median sunset, not Indiana's or Alaska's", () => {
    // The US counts each clock once, so its median is Chicago's 20:29,
    // within half an hour of Florida's and California's.
    const sun = countrySunTimes("2026-06-21", "US")!
    expect(sun).toEqual(
      sunTimes("2026-06-21", 41.85, -87.65, "America/Chicago")
    )
  })

  it("keeps one city's sunrise and sunset together", () => {
    // Greenland counts only Nuuk's clock, not Thule's or Danmarkshavn's,
    // where the sun doesn't rise in November.
    const sun = countrySunTimes("2026-11-10", "GL")!
    expect(Number.isFinite(sun.rise) && Number.isFinite(sun.set)).toBe(true)
  })

  it("has nothing for a country with no zone, or a skipped date", () => {
    expect(countrySunTimes("2026-06-21", "BV")).toBeNull()
    expect(countrySunTimes("2011-12-30", "WS")).toBeNull()
  })
})

describe("diveDark", () => {
  // Johannesburg's sunrise is 06:56 and sunset 17:25 on 21 June 2026.
  it("is dark when the dive ends after sunset", () => {
    expect(diveDark("2026-06-21T17:00", 40, "ZA")).toMatchObject({
      kind: "afterSunset",
    })
  })

  it("is dark when the dive starts before sunrise", () => {
    expect(diveDark("2026-06-21T06:30", 45, "ZA")).toMatchObject({
      kind: "beforeSunrise",
    })
  })

  it("is light for a dive between sunrise and sunset", () => {
    expect(diveDark("2026-06-21T07:00", 60, "ZA")).toBeNull()
    expect(diveDark("2026-06-21T16:00", 60, "ZA")).toBeNull()
  })

  it("counts from the start when there is no duration yet", () => {
    expect(diveDark("2026-06-21T17:20", null, "ZA")).toBeNull()
    expect(diveDark("2026-06-21T17:30", null, "ZA")).toMatchObject({
      kind: "afterSunset",
    })
  })

  it("goes by the evening before for a dive just after midnight", () => {
    // Reykjavik's sun sets at 00:04 on 22 June and rises at 02:56.
    expect(diveDark("2026-06-22T00:01", 2, "IS")).toBeNull()
    const ending = diveDark("2026-06-22T00:01", 30, "IS")
    expect(ending).toMatchObject({ kind: "afterSunset" })
    near((ending as { at: number }).at, 0, 4)
    expect(diveDark("2026-06-22T01:00", 30, "IS")).toMatchObject({
      kind: "beforeSunrise",
    })
  })

  it("is dark all day in polar night and never under the midnight sun", () => {
    expect(diveDark("2026-12-21T12:00", 30, "SJ")).toEqual({
      kind: "noSunrise",
    })
    expect(diveDark("2026-06-21T23:30", 60, "SJ")).toBeNull()
  })

  it("says nothing for a country with no zone, or a skipped date", () => {
    expect(diveDark("2026-06-21T22:00", 40, "BV")).toBeNull()
    expect(diveDark("2011-12-30T22:00", 40, "WS")).toBeNull()
  })
})
