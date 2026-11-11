import { parse } from "csv-parse/sync"
import fc from "fast-check"
import { beforeAll, describe, expect, it } from "vitest"

import { send, testApp } from "../../test/app.ts"
import { testDb } from "../../test/db.ts"
import { diveId, seededDb } from "../../test/fixture.ts"
import { fuzzOptions } from "../../../../packages/core/test/reference/fuzz.ts"
import type { Db } from "../db/open.ts"
import { mod, sacRate } from "@shylog/core"

import { cell, csvHeaders, encodeCsv, writeCsv } from "./writer.ts"

// The file as a spreadsheet reads it: rows of text, the BOM taken off.
const read = (csv: string): string[][] => parse(csv, { bom: true })

// Each dive's row as header → cell.
const rowsOf = (csv: string) => {
  const [header, ...rows] = read(csv)
  return rows.map((row) =>
    Object.fromEntries(header!.map((name, i) => [name, row[i]]))
  )
}

describe("encodeCsv", () => {
  it("quotes only fields that need it, with a BOM and CRLF", () => {
    expect(
      encodeCsv([
        ["a", "b,c", 'say "hi"'],
        ["line\nbreak", "cr\r", ""],
      ])
    ).toBe('\uFEFFa,"b,c","say ""hi"""\r\n"line\nbreak","cr\r",\r\n')
  })

  it("quotes a semicolon, which Excel splits on in some regions", () => {
    expect(encodeCsv([["Sam; Ann"]])).toBe('\uFEFF"Sam; Ann"\r\n')
  })

  it("keeps a row of one empty field", () => {
    expect(read(encodeCsv([["x"], [""]]))).toEqual([["x"], [""]])
  })

  it("survives a round trip through a CSV parser", () => {
    const table = fc.integer({ min: 1, max: 6 }).chain((width) =>
      fc.array(
        fc.array(fc.string({ unit: "binary" }), {
          minLength: width,
          maxLength: width,
        }),
        { minLength: 1, maxLength: 8 }
      )
    )
    fc.assert(
      fc.property(table, (rows) => {
        expect(read(encodeCsv(rows))).toEqual(rows)
      }),
      fuzzOptions(20261104, 500)
    )
  })
})

it("writes the header alone for an empty log", () => {
  const { csv, dives } = writeCsv(testDb())
  expect(dives).toBe(0)
  expect(read(csv)).toEqual([csvHeaders])
})

// A log typed by hand, built through the API as the phone builds it.
describe("a hand-logged log", () => {
  let db: Db
  let app: ReturnType<typeof testApp>
  let rows: Record<string, string>[]
  let opCount = 0
  const op = (fields: Record<string, unknown>) => ({
    opId: `op-${++opCount}`,
    opVersion: 1,
    deviceId: "device-phone",
    at: "2026-07-22T12:00:00.000Z",
    ...fields,
  })
  const entity = (kind: string, id: string, fields: Record<string, unknown>) =>
    op({ type: "upsertEntity", kind, id, fields })
  const dive = (diveId: string, fields: Record<string, unknown>) =>
    op({
      type: "upsertDive",
      diveId,
      fields: {
        siteId: "site-two-mile",
        duration: 2851,
        maxDepth: 18.4,
        ...fields,
      },
    })

  beforeAll(async () => {
    db = testDb()
    app = testApp({ db })
    const drafts = [
      [
        entity("region", "region-sodwana", {
          name: "Sodwana",
          countryCode: "ZA",
        }),
        entity("site", "site-two-mile", {
          name: 'Simon’s "Two Mile", Reef',
          countryCode: "ZA",
          regionId: "region-sodwana",
          bodyOfWater: "oceanSea",
        }),
        entity("site", "site-quarry", {
          name: "Miracle Waters",
          countryCode: "ZA",
          bodyOfWater: "lakeQuarry",
        }),
        entity("person", "person-sam", { name: "Naidoo, Sam" }),
        entity("person", "person-ann", { name: "Ann" }),
        entity("person", "person-lee", { name: "Lee" }),
        entity("trip", "trip-sodwana", { name: "Sodwana & friends" }),
        entity("diveCentre", "centre-coral", { name: "Coral Divers" }),
        dive("dive-a", {
          startTime: "2026-07-20T08:10:00",
          nitrox: true,
          oxygen: 324,
          cylinderMaterial: "aluminium",
          cylinderVolume: 11100,
          startPressure: 200,
          endPressure: 70,
          averageDepth: 12.3,
          buddies: ["person-sam", "person-ann"],
          diveProfessionals: ["person-lee"],
          // Stored in any order, listed in the app's.
          tags: ["wreck", "drift"],
          tripId: "trip-sodwana",
          diveCentreId: "centre-coral",
          surge: "moderate",
          surface: "calm",
          weather: "cloudy",
          minTemperature: -1,
          maxTemperature: 24,
          visibilityRating: "high",
          gearDetails: "=5 mm suit",
          diveType: "training",
          trainingAgency: "SSI",
          trainingCourse: "Deep",
          notableAnimals: "- saw a turtle",
          notes: 'First line, "quoted"\r\n\nSecond paragraph',
          entry: "smallBoat",
          current: "veryMild",
          workload: "light",
          thermalComfort: "veryCold",
          weight: 4.5,
        }),
      ],
      [
        dive("dive-b", {
          startTime: "2026-07-20T11:00:00",
          siteId: "site-quarry",
          visibility: 15,
          notes: "=1+1",
        }),
      ],
      [
        dive("dive-c", {
          startTime: "2026-07-21T08:00:00",
          ignored: true,
          // A full-width equals sign, which some spreadsheets read as =.
          notes: "\uFF1DSUM(1)",
        }),
      ],
      [dive("dive-gone", { startTime: "2026-07-21T10:00:00" })],
    ]
    for (const ops of drafts) {
      expect((await send(app, "POST", "/api/ops", { ops })).status).toBe(200)
    }
    expect((await send(app, "DELETE", "/api/dives/dive-gone")).status).toBe(200)
    rows = rowsOf(writeCsv(db).csv)
  })

  it("is one row per dive left, oldest first, ignored ones kept", () => {
    expect(rows.map((row) => row["Dive id"])).toEqual([
      "dive-a",
      "dive-b",
      "dive-c",
    ])
    expect(writeCsv(db).dives).toBe(3)
    expect(rows.map((row) => [row.Number, row.Ignored])).toEqual([
      ["1", "No"],
      ["2", "No"],
      ["", "Yes"],
    ])
  })

  it("is byte-identical on a second run, with CRLF between rows", () => {
    const { csv } = writeCsv(db)
    expect(csv).toBe(writeCsv(db).csv)
    expect(csv.startsWith("\uFEFFDive id,Number,Date,Time,")).toBe(true)
    // Every row starts after one; the notes hold another inside quotes.
    expect(csv.match(/\r\n(?=dive-)/g)).toHaveLength(3)
    expect(csv.endsWith("\r\n")).toBe(true)
  })

  it("writes every field in the app's units and labels", () => {
    expect(rows[0]).toEqual({
      "Dive id": "dive-a",
      Number: "1",
      Date: "2026-07-20",
      Time: "08:10:00",
      "Duration (min)": "47.52",
      "Max depth (m)": "18.4",
      "Average depth (m)": "12.3",
      Site: 'Simon’s "Two Mile", Reef',
      Region: "Sodwana",
      Country: "South Africa",
      "Body of water": "Ocean or sea",
      "Water type": "Salt",
      "Dive type": "Training",
      "Training agency": "SSI",
      "Training course": "Deep",
      Tags: "Drift; Wreck",
      Trip: "Sodwana & friends",
      "Dive centre": "Coral Divers",
      Buddies: "Naidoo, Sam; Ann",
      "Dive professionals": "Lee",
      Entry: "Small boat",
      Current: "Very mild",
      Surge: "Moderate",
      Surface: "Calm",
      Weather: "Cloudy",
      Workload: "Light",
      "Thermal comfort": "Very cold",
      "Min temperature (°C)": "-1",
      "Max temperature (°C)": "24",
      "Visibility (m)": "",
      "Visibility rating": "High",
      "Surface interval (min)": "",
      "Weight (kg)": "4.5",
      "Cylinder material": "Aluminium",
      "Cylinder volume (L)": "11.1",
      "Oxygen (%)": "32.4",
      "Start pressure (bar)": "200",
      "End pressure (bar)": "70",
      "SAC (L/min)": expect.stringMatching(/^\d+\.\d+$/),
      "MOD (m)": "32.7",
      "Max PO₂ (bar)": "0.931",
      "CNS (%)": "",
      OTU: "",
      // Text a spreadsheet would run as a formula gets a leading '.
      "Notable animals": "'- saw a turtle",
      "Gear details": "'=5 mm suit",
      Notes: 'First line, "quoted"\r\n\nSecond paragraph',
      Ignored: "No",
      "Dive computer": "",
      // No samples, so no computer to have counted any.
      "Ascent alarms": "",
      Profile: "",
    })
  })

  it("works out SAC, MOD and max PO₂ as the dive detail does", () => {
    // Hand values: 2,851 s at 12.3 m in salt water, 130 bar of 32.4 %.
    expect(rows[0]!["SAC (L/min)"]).toBe("12.871")
    // Air is 20.9 %, and fresh water at Miracle Waters.
    expect(rows[1]).toMatchObject({
      "Oxygen (%)": "20.9",
      "Water type": "Fresh",
      "MOD (m)": "57.9",
      "Max PO₂ (bar)": "0.589",
      "SAC (L/min)": "",
    })
  })

  it("prefixes every text a spreadsheet could read as a formula", () => {
    expect(rows.map((row) => row.Notes)).toEqual([
      'First line, "quoted"\r\n\nSecond paragraph',
      "'=1+1",
      "'\uFF1DSUM(1)",
    ])
  })

  // Saving trims text, so these come only from older or imported data.
  it("prefixes a formula behind spaces, or a leading tab or return", () => {
    expect(["  =1+1", "\u3000@x", "\tx", "\rx", "a=1", "-"].map(cell)).toEqual([
      "'  =1+1",
      "'\u3000@x",
      "'\tx",
      "'\rx",
      "a=1",
      "'-",
    ])
    // Numbers stay numbers, below zero too.
    expect([-1, 0.000001, null].map(cell)).toEqual(["-1", "0.000001", ""])
  })

  it("works out MOD at the log's maximum PO₂ setting", async () => {
    const put = (maxPo2: number) =>
      send(app, "PUT", "/api/settings", { maxPo2 })
    expect((await put(1.6)).status).toBe(200)
    try {
      const row = rowsOf(writeCsv(db).csv)[0]!
      expect(row["MOD (m)"]).toBe(String(mod(324, 1.6, { waterType: "salt" })))
      expect(row["MOD (m)"]).toBe("38.8")
    } finally {
      expect((await put(1.4)).status).toBe(200)
    }
  })

  it("leaves blanks for what isn't logged and gives intervals in minutes", () => {
    expect(rows[1]).toMatchObject({
      Region: "",
      Tags: "",
      Buddies: "",
      Trip: "",
      "Visibility (m)": "15",
      "Visibility rating": "",
      // 08:10 + 47:31 to 11:00.
      "Surface interval (min)": "122.48",
      "Cylinder volume (L)": "",
    })
  })
})

describe("the seeded log", { timeout: 20_000 }, () => {
  let db: Db
  let rows: Record<string, string>[]
  beforeAll(() => {
    db = seededDb()
    rows = rowsOf(writeCsv(db).csv)
  })

  it("has dive 63's figures from the computer", () => {
    const row = rows.find((r) => r["Dive id"] === diveId(db, 63))!
    expect(row).toMatchObject({
      Date: "2026-07-22",
      Time: "08:12:19",
      "Max depth (m)": "32.66",
      "Oxygen (%)": "32",
      "Max PO₂ (bar)": "1.38",
      "MOD (m)": "33.2",
      "Dive computer": "Suunto D4i",
    })
    expect(Number(row["CNS (%)"])).toBeGreaterThan(0)
    expect(Number(row.OTU)).toBeGreaterThan(0)
  })

  it("works out SAC from a typed duration and the samples' mean depth", async () => {
    const id = diveId(db, 63)
    const res = await send(testApp({ db }), "PATCH", `/api/dives/${id}`, {
      fields: {
        duration: 2400,
        cylinderVolume: 11100,
        startPressure: 200,
        endPressure: 60,
      },
    })
    expect(res.status).toBe(200)
    const row = rowsOf(writeCsv(db).csv).find((r) => r["Dive id"] === id)!
    // The typed 40 min beats the samples' time under water, and with no
    // typed average depth the samples' mean (20.989 m) beats the computer's.
    expect(row["SAC (L/min)"]).toBe(
      String(
        sacRate(
          {
            startPressure: 200,
            endPressure: 60,
            cylinderVolume: 11100,
            oxygen: 320,
            duration: 2400,
            averageDepth: 20.989,
          },
          { waterType: "salt" }
        )
      )
    )
    expect(row["Ascent alarms"]).toMatch(/^\d+$/)
  })

  it("holds each dive's samples and events in its profile cell", () => {
    for (const row of rows) {
      const samples = db
        .prepare(
          "SELECT time, depth, temperature, pressure FROM samples WHERE dive_id = ? ORDER BY time"
        )
        .all(row["Dive id"]) as Record<string, number | null>[]
      const events = db
        .prepare(
          "SELECT type, start_seconds AS start, end_seconds AS end FROM events WHERE dive_id = ? ORDER BY start_seconds, id"
        )
        .all(row["Dive id"]) as Record<string, string | number | null>[]
      if (!samples.length) {
        expect(row.Profile).toBe("")
        continue
      }
      const profile = JSON.parse(row.Profile!) as {
        samples: (number | null)[][]
        events: (string | number | null)[][]
      }
      const filled = <T>(values: T[], length: number) => [
        ...values,
        ...Array<null>(length - values.length).fill(null),
      ]
      expect(profile.samples.map((s) => filled(s, 4))).toEqual(
        samples.map((s) => [s.time, s.depth, s.temperature, s.pressure])
      )
      expect(profile.events.map((e) => filled(e, 3))).toEqual(
        events.map((e) => [e.type, e.start, e.end])
      )
    }
  })
})
