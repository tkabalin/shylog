import { beforeAll, describe, expect, it } from "vitest"

import { diveId, fixtureStart, fixtureXml, seededDb } from "../test/fixture.ts"
import type { Db } from "./db/open.ts"
import { seed } from "./seed.ts"

let db: Db
beforeAll(() => {
  db = seededDb()
})

const dive = (n: keyof typeof fixtureStart) =>
  db
    .prepare(
      `SELECT d.*, s.name AS site FROM dives d JOIN sites s ON s.id = d.site_id WHERE d.start_time = ?`
    )
    .get(fixtureStart[n]) as Record<string, unknown>

describe("seeding the D4i fixture", () => {
  it("writes the 46 scuba dives and leaves out the freedives", () => {
    expect(db.prepare("SELECT count(*) FROM dives").pluck().get()).toBe(46)
    expect(
      db
        .prepare(
          "SELECT count(*) FROM dives WHERE start_time LIKE '2025-12-28%'"
        )
        .pluck()
        .get()
    ).toBe(0)
  })

  it("reads 21% as air and the nitrox mixes in tenths", () => {
    expect(dive(54)).toMatchObject({ nitrox: 0, oxygen: null })
    for (const n of [52, 58, 63] as const) {
      expect(dive(n)).toMatchObject({ nitrox: 1, oxygen: 320 })
    }
    expect(dive(61)).toMatchObject({ nitrox: 1, oxygen: 330 })
    expect(
      db.prepare("SELECT count(*) FROM dives WHERE nitrox = 1").pluck().get()
    ).toBe(4)
  })

  it("takes depths from the export and temperatures from the samples", () => {
    expect(dive(63)).toMatchObject({
      max_depth: 32.66,
      average_depth: 21.005,
      min_temperature: 23,
      max_temperature: 24,
      duration: 2500,
      computer_model: "Suunto D4i",
    })
    expect(dive(6)).toMatchObject({ min_temperature: 29, max_temperature: 34 })
  })

  it("marks what it fills as computer values", () => {
    const fields = db
      .prepare(
        "SELECT field, source FROM field_meta WHERE dive_id = ? ORDER BY field"
      )
      .all(diveId(db, 63))
    expect(fields).toEqual(
      [
        "averageDepth",
        "duration",
        "maxDepth",
        "maxTemperature",
        "minTemperature",
        "nitrox",
        "oxygen",
        "startTime",
      ].map((field) => ({ field, source: "computer" }))
    )
  })

  it("puts the Sodwana week on a Sodwana site", () => {
    expect(dive(52).site).toBe("Sodwana")
    expect(dive(63).site).toBe("Sodwana")
    expect(dive(36).site).toBe("Unnamed site")
    expect(
      db
        .prepare(
          "SELECT s.name, count(*) AS dives FROM dives d JOIN sites s ON s.id = d.site_id GROUP BY s.name ORDER BY s.name"
        )
        .all()
    ).toEqual([
      { name: "Sodwana", dives: 14 },
      { name: "Unnamed site", dives: 32 },
    ])
  })

  it("fills the derived fields", () => {
    expect(dive(1)).toMatchObject({ number: 1, surface_interval: null })
    // Dive 1 ends at its last sample below 0.75 m, 2111 s in.
    expect(dive(2)).toMatchObject({ number: 2, surface_interval: 600 })
    expect(dive(63).number).toBe(37)
    // Subsurface's figures (packages/core/test/subsurface.ts).
    expect(dive(63)).toMatchObject({ cns: 15, otu: 41 })
    expect(dive(54)).toMatchObject({ cns: 4, otu: 12 })
    expect(dive(61)).toMatchObject({ cns: 18, otu: 48 })
    expect(dive(36)).toMatchObject({ cns: 1, otu: 0 })
  })

  it("stores the sparkline and ascent alarms with the samples", () => {
    expect(dive(54).ascent_alarm_count).toBe(5)
    const line = JSON.parse(dive(63).sparkline as string) as number[]
    expect(line).toHaveLength(24)
    const deepest = db
      .prepare("SELECT max(depth) FROM samples WHERE dive_id = ?")
      .pluck()
      .get(diveId(db, 63))
    expect(Math.max(...line)).toBe(deepest)
  })

  it("journals one entry", () => {
    expect(
      db.prepare("SELECT type, payload FROM ops WHERE type = 'seed'").all()
    ).toEqual([
      { type: "seed", payload: '{"source":"d4i-2026-10-12.uddf","dives":46}' },
    ])
  })

  it("refuses a log that already has dives", () => {
    expect(() => seed(db, fixtureXml, "again")).toThrow(/already has dives/)
  })
})
