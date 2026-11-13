// @vitest-environment node
import { diveSacRate } from "@shylog/core"
import { beforeAll, describe, expect, it } from "vitest"

import type { Dive } from "@/data/db"
import type { LogView } from "@/data/log"

import { cachedStatistics } from "./cache"
import { countedDives, statistics, statsYears } from "./figures"
import { seededLog } from "./seeded-log"
import { dive, syntheticLog } from "./synthetic"

const today = "2026-10-19"
// Fixture dives by Subsurface's divenumber, as start times.
const deepest = "2026-07-18T08:39:26" // 54
const longest = "2026-05-23T09:58:01" // 50
const first = "2019-02-10T11:01:29" // 1

const ignoring = (log: LogView, startTime: string): LogView => ({
  ...log,
  dives: log.dives.map((d) =>
    d.startTime === startTime ? { ...d, ignored: true } : d
  ),
})

describe("statistics on the seeded fixture", () => {
  let log: LogView
  let all: ReturnType<typeof statistics>
  beforeAll(async () => {
    log = await seededLog()
    all = statistics(log, undefined, today)
  })

  it("totals the 42 scuba dives", () => {
    expect(all.count).toBe(42)
    expect(all.seconds).toBe(122_580)
  })

  it("names the deepest and longest dives", () => {
    expect(all.records.deepest?.dive.startTime).toBe(deepest)
    expect(all.records.deepest?.value).toBe(42.28)
    expect(all.records.longest?.dive.startTime).toBe(longest)
    expect(Math.round(all.records.longest!.value / 60)).toBe(72)
  })

  it("takes plain means of max depth and duration", () => {
    expect(all.averageMaxDepth?.toFixed(1)).toBe("17.5")
    expect(Math.round(all.averageDuration! / 60)).toBe(49)
  })

  it("counts dives per year, with the years between, and per month", () => {
    expect(all.perPeriod).toEqual(
      [
        ["2019", 5],
        ["2020", 0],
        ["2021", 0],
        ["2022", 0],
        ["2023", 0],
        ["2024", 0],
        ["2025", 2],
        ["2026", 35],
      ].map(([label, count]) => ({ label, count }))
    )
    expect(
      statistics(log, "2026", today).perPeriod.map((m) => m.count)
    ).toEqual([2, 1, 1, 5, 4, 0, 15, 6, 1, 0, 0, 0])
  })

  it("lists the years with dives, newest first", () => {
    expect(statsYears(countedDives(log))).toEqual(["2026", "2025", "2019"])
  })

  it("groups by depth band and time of day", () => {
    expect(all.depthBands.map((band) => band.count)).toEqual([10, 13, 14, 5])
    expect(all.timeOfDay.map((part) => part.count)).toEqual([18, 18, 3, 3])
  })

  it("runs the water range from the lowest minimum to the highest maximum", () => {
    expect(all.water).toEqual({ min: 12, max: 29 })
  })

  it("gives the nitrox share and its average oxygen", () => {
    expect(all.gas).toEqual({ air: 38, nitrox: 4, averageOxygen: 322.5 })
  })

  it("leaves an ignored dive out of every figure and chart", () => {
    const without = statistics(ignoring(log, deepest), undefined, today)
    expect(without.count).toBe(41)
    expect(without.records.deepest?.dive.startTime).not.toBe(deepest)
    expect(without.depthBands.reduce((n, band) => n + band.count, 0)).toBe(41)
    expect(without.timeOfDay.reduce((n, part) => n + part.count, 0)).toBe(41)
    expect(without.perPeriod.at(-1)?.count).toBe(34)
    expect(without.gas.air + without.gas.nitrox).toBe(41)
    expect(without.sites.reduce((n, site) => n + site.count, 0)).toBe(41)
    expect(without.records.descended!.metres).toBeCloseTo(735.87 - 42.28, 2)
  })

  it("moves the anniversary to the next dive when the first is ignored", () => {
    const moved = statistics(ignoring(log, first), "2026", today).records
    expect(moved.anniversary?.first).toBe("2019-02-10")
    const both = ignoring(ignoring(log, first), "2019-02-10T11:46:40")
    expect(statistics(both, undefined, today).records.anniversary?.first).toBe(
      "2019-06-15"
    )
  })

  it("caches per log and year, and recomputes for a new log", () => {
    const a = cachedStatistics(log, "2026", today)
    expect(cachedStatistics(log, "2026", today)).toBe(a)
    expect(cachedStatistics(log, undefined, today)).not.toBe(a)
    expect(cachedStatistics({ ...log }, "2026", today)).not.toBe(a)
  })
})

describe("statistics on hand-built dives", () => {
  const cylinder = {
    cylinderVolume: 12_000,
    averageDepth: 12,
    startPressure: 200,
  } satisfies Partial<Dive>

  it("weights the average SAC by duration and drops bogus rates", () => {
    const a = dive({
      ...cylinder,
      endPressure: 50,
      duration: 3000,
      startTime: "2026-03-01T09:00:00",
    })
    const b = dive({
      ...cylinder,
      endPressure: 100,
      duration: 1800,
      startTime: "2026-03-02T09:00:00",
    })
    // 1 bar over ten hours: well under 0.1 L/min.
    const bogus = dive({ ...cylinder, endPressure: 199, duration: 36_000 })
    const noSac = dive({ duration: 600 })
    const water = { waterType: "salt" } as const
    const sac = (d: Dive) =>
      diveSacRate(d, { duration: false, averageDepth: false }, water)!
    expect(sac(bogus)).toBeLessThanOrEqual(0.1)
    const stats = statistics(
      syntheticLog([a, b, bogus, noSac]),
      undefined,
      today
    )
    expect(stats.sac.average).toBeCloseTo(
      (sac(a) * 3000 + sac(b) * 1800) / 4800,
      9
    )
    expect(stats.sac.trend.map((p) => p.dive.id)).toEqual([a.id, b.id])
  })

  it("groups visibility in metres with the ratings", () => {
    const dives = [
      dive({ visibility: 4.9 }),
      dive({ visibility: 5 }),
      dive({ visibility: 10 }),
      dive({ visibility: 10.1 }),
      dive({ visibilityRating: "high" }),
      dive(),
    ]
    const visibility = statistics(
      syntheticLog(dives),
      undefined,
      today
    ).conditions.find((c) => c.key === "visibility")!
    expect(visibility.levels.map((l) => l.count)).toEqual([1, 2, 2])
    expect(visibility.notLogged).toBe(1)
    // The earlier level on a tie.
    expect(visibility.top?.key).toBe("average")
  })

  it("puts a 10.0 m dive in 10 to 18 m and an 18:00 dive at night", () => {
    const stats = statistics(
      syntheticLog([
        dive({ maxDepth: 9.999, startTime: "2026-01-01T10:59:00" }),
        dive({ maxDepth: 10, startTime: "2026-01-01T11:00:00" }),
        dive({ maxDepth: 30, startTime: "2026-01-01T18:00:00" }),
      ]),
      undefined,
      today
    )
    expect(stats.depthBands.map((b) => b.count)).toEqual([1, 1, 0, 1])
    expect(stats.timeOfDay.map((t) => t.count)).toEqual([1, 1, 0, 1])
  })

  it("ranks sites, buddies, regions and tags", () => {
    const sites = [
      {
        id: "site-a",
        name: "Long Beach",
        countryCode: "ZA",
        regionId: "region-st",
      },
      {
        id: "site-b",
        name: "Two Mile Reef",
        countryCode: "ZA",
        regionId: null,
      },
    ] as LogView["sites"] extends Map<string, infer S> ? S[] : never
    const dives = [
      dive({ siteId: "site-b" }),
      dive({ siteId: "site-a" }),
      dive({ siteId: "site-a" }),
    ]
    const stats = statistics(
      syntheticLog(dives, {
        sites,
        regions: [{ id: "region-st", name: "Simon's Town", countryCode: "ZA" }],
        people: [
          { id: "person-sam", name: "Sam Naidoo" },
          { id: "person-ann", name: "Anna Keller" },
        ],
        links: {
          [dives[0]!.id]: {
            buddies: ["person-sam", "person-ann"],
            tags: ["night"],
          },
          [dives[1]!.id]: { buddies: ["person-sam"], tags: ["night", "wreck"] },
          // A dive professional isn't a buddy.
          [dives[2]!.id]: { professionals: ["person-ann"] },
        },
      }),
      undefined,
      today
    )
    expect(stats.sites.map((s) => [s.name, s.place, s.count])).toEqual([
      ["Long Beach", "Simon's Town", 2],
      ["Two Mile Reef", "South Africa", 1],
    ])
    expect(stats.buddies.map((b) => [b.name, b.count])).toEqual([
      ["Sam Naidoo", 2],
      ["Anna Keller", 1],
    ])
    expect(stats.regions.map((r) => [r.name, r.country, r.count])).toEqual([
      ["Simon's Town", "South Africa", 2],
      ["South Africa", null, 1],
    ])
    expect(stats.tags.map((t) => [t.key, t.count])).toEqual([
      ["night", 2],
      ["wreck", 1],
    ])
  })

  it("leaves out refused drafts, as the Log's header does", () => {
    const stats = statistics(
      syntheticLog([dive(), dive({ rejected: "Bad site" })]),
      undefined,
      today
    )
    expect(stats.count).toBe(1)
  })

  it("has no records or ranges for an empty year", () => {
    const stats = statistics(syntheticLog([dive()]), "2025", today)
    expect(stats.count).toBe(0)
    expect(stats.records.deepest).toBeNull()
    expect(stats.records.descended).toBeNull()
    expect(stats.water).toBeNull()
    expect(stats.averageMaxDepth).toBeNull()
  })
})
