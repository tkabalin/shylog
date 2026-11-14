import { describe, expect, it } from "vitest"

import type { Dive, Region, Site } from "@/data/db"
import type { DiveLinks } from "@/data/log"

import { dive, syntheticLog } from "../synthetic"
import { fieldsOf, rowsOf, type Pattern, type Row } from "./catalogue"
import { findPatterns } from "./patterns"
import { change } from "./rules/change"
import { difference } from "./rules/difference"
import { habitsOf } from "./rules/habit"
import { records } from "./rules/record"
import { seasons } from "./rules/season"
import { threshold } from "./rules/threshold"
import { trend } from "./rules/trend"

const sentence = (pattern: Pattern | null | undefined) =>
  pattern?.words.join("")

// Dives a day apart from 1 July 2026, oldest first, each taking its fields.
const days = (list: Partial<Dive>[], from = "2026-07-01") =>
  list.map((fields, i) => {
    const date = new Date(`${from}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + i)
    return dive({
      startTime: `${date.toISOString().slice(0, 10)}T09:00:00`,
      ...fields,
    })
  })

const times = <T>(n: number, fields: T) =>
  Array.from({ length: n }, () => fields)

const sites: Site[] = [
  {
    id: "site-a",
    name: "Long Beach",
    countryCode: "ZA",
    regionId: "region-st",
    bodyOfWater: "oceanSea",
    waterType: "salt",
  } as Site,
  {
    id: "site-b",
    name: "Castle Rock",
    countryCode: "ZA",
    regionId: null,
    bodyOfWater: "oceanSea",
    waterType: "salt",
  } as Site,
]
const regions = [
  { id: "region-st", name: "Simon's Town", countryCode: "ZA" } as Region,
]

function setup(
  list: Dive[],
  links: Record<string, Partial<DiveLinks>> = {},
  sac?: (dive: Dive) => number | null
) {
  const log = syntheticLog(list, { sites, regions, links })
  const ordered = [...list].sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  )
  const rows: Row[] = rowsOf(ordered, log).map((row) =>
    sac ? { ...row, sac: sac(row.dive) } : row
  )
  return { log, rows, fields: fieldsOf(log) }
}

describe("difference", () => {
  it("finds the best adjacent-level split, with five dives a group", () => {
    const list = days([
      ...times(5, { current: "none", maxDepth: 10 }),
      ...times(5, { current: "mild", maxDepth: 11 }),
      ...times(5, { current: "moderate", maxDepth: 20 }),
      ...times(5, { current: "hard", maxDepth: 21 }),
    ] as Partial<Dive>[])
    const { rows, fields } = setup(list)
    const pattern = difference(rows, "duration", fields.current)
    expect(pattern).toBeNull()
    const depth = difference(
      rows,
      "maxDepth",
      // Max depth isn't compared across current in the catalogue, but any
      // field splits the same way.
      fields.current
    )
    expect(sentence(depth)).toBe(
      "You dive 10.0 m deeper in moderate or stronger current."
    )
    expect(depth!.groups).toEqual([
      {
        label: "Moderate or stronger",
        detail: "10 dives",
        value: "20.5",
        unit: "m",
      },
      { label: "None or mild", detail: "10 dives", value: "10.5", unit: "m" },
    ])
  })

  it("needs five dives in each group", () => {
    const list = days([
      ...times(4, { current: "moderate", maxDepth: 20 }),
      ...times(9, { current: "none", maxDepth: 10 }),
    ] as Partial<Dive>[])
    const { rows, fields } = setup(list)
    expect(difference(rows, "maxDepth", fields.current)).toBeNull()
  })

  it("sets one value against the rest, and a person's dives against those without", () => {
    const list = days([
      ...times(5, { nitrox: true, oxygen: 320, maxDepth: 25 }),
      ...times(6, { maxDepth: 15 }),
    ] as Partial<Dive>[])
    const links = Object.fromEntries(
      list.slice(0, 5).map((d) => [d.id, { buddies: ["person-sam"] }])
    )
    const { rows, log } = setup(list, links)
    log.people.set("person-sam", { id: "person-sam", name: "Sam" } as never)
    const fields = fieldsOf(log)
    expect(sentence(difference(rows, "maxDepth", fields.gas))).toBe(
      "You dive 10.0 m deeper on nitrox."
    )
    expect(sentence(difference(rows, "maxDepth", fields.buddy))).toBe(
      "You dive 10.0 m deeper with Sam."
    )
  })

  it("leaves out dives that didn't log the field", () => {
    const list = days([
      ...times(5, { current: "moderate", maxDepth: 20 }),
      ...times(5, { current: "none", maxDepth: 10 }),
      ...times(20, { maxDepth: 40 }),
    ] as Partial<Dive>[])
    const { rows, fields } = setup(list)
    expect(
      difference(rows, "maxDepth", fields.current)!.groups[1]
    ).toMatchObject({ detail: "5 dives", value: "10.0" })
  })

  it("holds each measure to its minimum", () => {
    const depthBy = (gap: number) => {
      const { rows, fields } = setup(
        days([
          ...times(5, { nitrox: true, maxDepth: 10 + gap }),
          ...times(5, { maxDepth: 10 }),
        ] as Partial<Dive>[])
      )
      return difference(rows, "maxDepth", fields.gas)
    }
    expect(depthBy(2.9)).toBeNull()
    expect(depthBy(3)).not.toBeNull()

    const minutesBy = (gap: number) => {
      const { rows, fields } = setup(
        days([
          ...times(5, { nitrox: true, duration: 2400 + gap }),
          ...times(5, { duration: 2400 }),
        ] as Partial<Dive>[])
      )
      return difference(rows, "duration", fields.gas)
    }
    expect(minutesBy(299)).toBeNull()
    expect(minutesBy(300)).not.toBeNull()

    const alarmsBy = (more: number) => {
      const { rows, fields } = setup(
        days([
          ...times(5, { nitrox: true, sparkline: [0], ascentAlarmCount: more }),
          ...times(5, { sparkline: [0], ascentAlarmCount: 0 }),
        ] as Partial<Dive>[])
      )
      return difference(rows, "ascentAlarms", fields.gas)
    }
    expect(alarmsBy(0.4)).toBeNull()
    expect(alarmsBy(0.5)).not.toBeNull()

    const coldBy = (cold: number) => {
      const { rows, fields } = setup(
        days([
          ...times(cold, { nitrox: true, thermalComfort: "cold" }),
          ...times(10 - cold, { nitrox: true, thermalComfort: "comfortable" }),
          ...times(10, { thermalComfort: "comfortable" }),
        ] as Partial<Dive>[])
      )
      return difference(rows, "cold", fields.gas)
    }
    // A share needs 20 percentage points.
    expect(coldBy(1)).toBeNull()
    expect(sentence(coldBy(2))).toBe(
      "You felt cold on 20% of dives on nitrox, against none on air."
    )
  })

  it("holds SAC rate to 1.5 L/min and 10% of the lower group", () => {
    const sacBy = (high: number, low: number) => {
      const list = days([
        ...times(5, { nitrox: true }),
        ...times(5, {}),
      ] as Partial<Dive>[])
      const { rows, fields } = setup(list, {}, (d) => (d.nitrox ? high : low))
      return difference(rows, "sac", fields.gas)
    }
    expect(sacBy(16.4, 15)).toBeNull()
    expect(sentence(sacBy(16.5, 15))).toBe(
      "Your SAC rate is 1.5 L/min higher on nitrox."
    )
    // 1.5 L/min, but under 10% of 20.
    expect(sacBy(21.5, 20)).toBeNull()
    expect(sacBy(22, 20)).not.toBeNull()
  })

  it("counts ascent alarms only on dives with a profile", () => {
    const { rows, fields } = setup(
      days([
        ...times(5, { nitrox: true, sparkline: [0], ascentAlarmCount: 2 }),
        ...times(5, { sparkline: [0], ascentAlarmCount: 0 }),
        // Hand-logged: no profile, so no alarm count to average.
        ...times(5, { nitrox: true, sparkline: null, ascentAlarmCount: 0 }),
      ] as Partial<Dive>[])
    )
    expect(
      difference(rows, "ascentAlarms", fields.gas)!.groups[0]
    ).toMatchObject({ detail: "5 dives", value: "2.0" })
  })
})

describe("threshold", () => {
  const temperatures = (cold: number, below: number) =>
    days([
      ...times(cold, { minTemperature: 14, thermalComfort: "cold" }),
      ...times(below - cold, {
        minTemperature: 14,
        thermalComfort: "comfortable",
      }),
      ...times(2, { minTemperature: 18, thermalComfort: "cold" }),
      ...times(2, { minTemperature: 18, thermalComfort: "comfortable" }),
      ...times(6, { minTemperature: 22, thermalComfort: "comfortable" }),
    ] as Partial<Dive>[])

  it("scans whole-degree cut-offs for the cleanest split", () => {
    const { rows } = setup(temperatures(5, 5))
    const pattern = threshold(rows)
    expect(sentence(pattern)).toBe(
      "You felt cold on all 5 dives below 18 °C, and on none above 18 °C."
    )
    // The dives at the cut-off are shown as left out, so the rows add up.
    expect(pattern!.groups).toEqual([
      { label: "Below 18 °C", detail: "5 dives", value: "5 cold" },
      {
        label: "18 °C",
        detail: "4 dives",
        value: "left out",
        quiet: true,
      },
      { label: "Above 18 °C", detail: "6 dives", value: "none cold" },
    ])
  })

  it("gives the count when not every dive on a side matches", () => {
    const { rows } = setup(temperatures(4, 5))
    expect(sentence(threshold(rows))).toBe(
      "You felt cold on 4 of 5 dives below 18 °C, and on none above 18 °C."
    )
  })

  it("needs four dives on each side, 80% of them matching", () => {
    expect(threshold(setup(temperatures(3, 3)).rows)).toBeNull()
    expect(threshold(setup(temperatures(3, 5)).rows)).toBeNull()
  })
})

describe("change", () => {
  const years = (before: number, now: number, count = 8) =>
    days([
      ...times(before, { nitrox: true, startTime: "2025-03-01T09:00:00" }),
      ...times(count - before, { startTime: "2025-03-02T09:00:00" }),
      ...times(now, { nitrox: true, startTime: "2026-03-01T09:00:00" }),
      ...times(count - now, { startTime: "2026-03-02T09:00:00" }),
    ] as Partial<Dive>[])

  it("compares a year with the year before", () => {
    const { rows } = setup(years(1, 5))
    const year = rows.filter((r) => r.dive.startTime.startsWith("2026"))
    const pattern = change(year, rows, "2026", "nitrox")
    expect(sentence(pattern)).toBe(
      "Nitrox rose from 13% to 63% of dives in 2026 against 2025."
    )
    expect(pattern!.groups.map((g) => g.label)).toEqual(["2026", "2025"])
  })

  it("compares the two halves of the log for all time", () => {
    const { rows } = setup(years(0, 5))
    expect(sentence(change(rows, rows, undefined, "nitrox"))).toBe(
      "Nitrox rose from none to 63% of dives over your last 8 dives against the 8 before."
    )
  })

  it("needs eight dives in each period", () => {
    const { rows } = setup(years(1, 5, 7))
    const year = rows.filter((r) => r.dive.startTime.startsWith("2026"))
    expect(change(year, rows, "2026", "nitrox")).toBeNull()
    expect(change(rows, rows, undefined, "nitrox")).toBeNull()
  })
})

describe("trend", () => {
  const rising = (n: number) =>
    days(
      Array.from({ length: n }, (_, i) => ({ maxDepth: 10 + i })),
      "2026-01-05"
    )

  it("fits a line through the dives in order", () => {
    const { rows } = setup(rising(16))
    const pattern = trend(rows, "2026", "maxDepth")
    expect(sentence(pattern)).toBe("Your max depth is up 15.0 m since January.")
    expect(pattern!.groups).toMatchObject([
      { label: "Trend now", value: "25.0" },
      { label: "Trend at the start", value: "10.0" },
    ])
    expect(sentence(trend(rows, undefined, "maxDepth"))).toBe(
      "Your max depth is up 15.0 m since Jan 2026."
    )
  })

  it("spaces dives by their order, not their dates", () => {
    // Ten years before the rest, the first dive would make a flat line
    // steep against dates; in order it is one step like the others.
    const list = rising(16)
    list[0] = { ...list[0]!, startTime: "2016-01-05T09:00:00" }
    expect(sentence(trend(setup(list).rows, undefined, "maxDepth"))).toBe(
      "Your max depth is up 15.0 m since Jan 2016."
    )
  })

  it("needs eight dives in each half", () => {
    expect(trend(setup(rising(15)).rows, undefined, "maxDepth")).toBeNull()
  })

  it("keeps its ends at nothing or more, and says the change between them", () => {
    // Twelve dives with no alarm, then four with two: the line starts at
    // -0.56, shown as none, and ends at 1.56.
    const list = days([
      ...times(12, { sparkline: [0], ascentAlarmCount: 0 }),
      ...times(4, { sparkline: [0], ascentAlarmCount: 2 }),
    ] as Partial<Dive>[])
    const pattern = trend(setup(list).rows, undefined, "ascentAlarms")
    expect(sentence(pattern)).toBe(
      "Ascent alarms are up 1.6 a dive since Jul 2026."
    )
    expect(pattern!.groups).toMatchObject([
      { label: "Trend now", value: "1.6" },
      { label: "Trend at the start", value: "none" },
    ])
    expect(pattern!.rising).toBe(true)
  })
})

describe("habit", () => {
  const sites: Site[] = [
    {
      id: "site-a",
      name: "Long Beach",
      countryCode: "ZA",
      regionId: null,
    } as Site,
    {
      id: "site-c",
      name: "Roman Rock",
      countryCode: "ZA",
      regionId: null,
    } as Site,
    {
      id: "site-u",
      name: "Unknown site",
      countryCode: "ZA",
      regionId: null,
    } as Site,
  ]
  const at = (siteIds: string[]) => {
    const list = days(siteIds.map((siteId) => ({ siteId })))
    const log = syntheticLog(list, { sites })
    return { rows: rowsOf([...list], log), log }
  }
  const habit = (siteIds: string[]) => {
    const { rows, log } = at(siteIds)
    return habitsOf(rows, log).find((p) => p.field === "site")
  }

  it("needs 60% over ten dives", () => {
    const pattern = habit([...times(6, "site-a"), ...times(4, "site-c")])
    expect(sentence(pattern)).toBe("60% of your dives are at Long Beach.")
    expect(
      habit([...times(5, "site-a"), ...times(5, "site-c")])
    ).toBeUndefined()
    expect(habit(times(9, "site-a"))).toBeUndefined()
  })

  it("never names the Unknown site, which still counts as a dive", () => {
    expect(habit(times(10, "site-u"))).toBeUndefined()
    expect(
      sentence(habit([...times(7, "site-u"), ...times(3, "site-a")]))
    ).toBeUndefined()
    expect(
      sentence(habit([...times(6, "site-a"), ...times(4, "site-u")]))
    ).toBe("60% of your dives are at Long Beach.")
  })

  it("leaves out the rest when there is none", () => {
    expect(habit(times(10, "site-a"))!.groups).toEqual([
      { label: "Long Beach", detail: "10 dives", value: "100%" },
    ])
  })

  it("counts a region over every dive, a site with none included", () => {
    const list = days([
      ...times(7, { siteId: "site-a" }),
      ...times(3, { siteId: "site-b" }),
    ] as Partial<Dive>[])
    const { rows, log } = setup(list)
    // Long Beach is in Simon's Town; Castle Rock has no region.
    expect(
      sentence(habitsOf(rows, log).find((p) => p.field === "region"))
    ).toBe("70% of your dives are in Simon's Town.")
  })

  it("counts a buddy over every dive", () => {
    const list = days(times(10, {}))
    const links = Object.fromEntries(
      list.slice(0, 6).map((d) => [d.id, { buddies: ["person-sam"] }])
    )
    const { rows, log } = setup(list, links)
    log.people.set("person-sam", { id: "person-sam", name: "Sam" } as never)
    expect(sentence(habitsOf(rows, log).find((p) => p.field === "buddy"))).toBe(
      "Sam is on 60% of your dives."
    )
  })

  it("leaves time of day, entry and gas to the Habits answers", () => {
    const { rows, log } = setup(days(times(12, { entry: "beachShore" })))
    expect(habitsOf(rows, log).map((p) => p.field)).not.toContain("entry")
    expect(habitsOf(rows, log).map((p) => p.field)).not.toContain("gas")
    expect(habitsOf(rows, log).map((p) => p.field)).not.toContain("timeOfDay")
  })
})

describe("season", () => {
  const months = (siteId: string) =>
    [
      ...times(5, {
        siteId,
        minTemperature: 18,
        startTime: "2026-03-01T09:00:00",
      }),
      ...times(5, {
        siteId,
        minTemperature: 13,
        startTime: "2026-08-01T09:00:00",
      }),
      ...times(4, {
        siteId,
        minTemperature: 10,
        startTime: "2026-07-01T09:00:00",
      }),
    ].map((fields) => dive(fields))

  it("compares a region's warmest month with its coldest, five dives each", () => {
    const { rows, log } = setup(months("site-a"))
    const [season] = seasons(rows, log)
    // July's four dives are too few to count as its coldest month.
    expect(sentence(season)).toBe(
      "Simon's Town is 5 °C warmer in March than in August."
    )
    expect(season!.groups.map((g) => g.label)).toEqual(["March", "August"])
  })

  it("needs a region", () => {
    const { rows, log } = setup(months("site-b"))
    expect(seasons(rows, log)).toEqual([])
  })
})

describe("records", () => {
  it("leave out those the Records card shows", () => {
    const { rows } = setup([
      dive({ maxDepth: 12.3, duration: 2700, minTemperature: 15 }),
    ])
    // One dive: no busiest month, no gap, and no deepest, longest or
    // coldest, which the card has.
    expect(records(rows)).toEqual([])
  })

  it("find the busiest month and the longest gap, with no groups", () => {
    const { rows } = setup([
      ...days(times(3, {}), "2026-07-01"),
      dive({ startTime: "2026-09-10T09:00:00" }),
      dive({ startTime: "2028-11-20T09:00:00" }),
    ])
    const found = records(rows)
    expect(found.map(sentence)).toEqual([
      "Your busiest month was July 2026, with 3 dives.",
      "Your longest gap between dives was 2 years 2 months, from 10 Sep 2026 to 20 Nov 2028.",
    ])
    expect(found.every((p) => !p.groups.length)).toBe(true)
  })
})

describe("ignored dives", () => {
  it("never enter a group or a record", () => {
    // Counted, the air dives would average 30 m and be the deeper group,
    // and July would have 15 dives.
    const list = days([
      ...times(5, { nitrox: true, oxygen: 320, maxDepth: 20 }),
      ...times(5, { maxDepth: 10 }),
      ...times(5, { maxDepth: 50, ignored: true }),
    ] as Partial<Dive>[])
    const { all } = findPatterns(setup(list).log, undefined)
    const gas = all.find((p) => p.id === "difference:maxDepth:gas")
    expect(sentence(gas)).toBe("You dive 10.0 m deeper on nitrox.")
    expect(gas!.groups[1]).toMatchObject({ label: "Air", detail: "5 dives" })
    expect(sentence(all.find((p) => p.id === "record:month"))).toBe(
      "Your busiest month was July 2026, with 10 dives."
    )
  })
})
