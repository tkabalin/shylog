import { normaliseName, placeKey } from "@shylog/core"
import { beforeEach, describe, expect, it } from "vitest"

import { testDb } from "../../test/db.ts"
import type { Db } from "./open.ts"

let db: Db
beforeEach(() => {
  db = testDb()
})

const site = (id: string, name: string, country: string) =>
  db
    .prepare(
      "INSERT INTO sites (id, name, key, country_code, water_type) VALUES (?, ?, ?, ?, 'salt')"
    )
    .run(id, name, placeKey(name, country), country)

const region = (id: string, name: string, country: string) =>
  db
    .prepare(
      "INSERT INTO regions (id, name, key, country_code) VALUES (?, ?, ?, ?)"
    )
    .run(id, name, placeKey(name, country), country)

const unique = /UNIQUE constraint failed/

describe("unique keys", () => {
  it("refuse two sites that normalise alike in one country", () => {
    site("site-a", "Long Beach", "ZA")
    expect(() => site("site-b", "lông  beach ", "ZA")).toThrow(unique)
    expect(() => site("site-c", "Long Beach", "VN")).not.toThrow()
  })

  it("refuse two regions that normalise alike in one country", () => {
    region("region-a", "Sodwana", "ZA")
    expect(() => region("region-b", "sodwana", "ZA")).toThrow(unique)
    expect(() => region("region-c", "Sodwana", "MZ")).not.toThrow()
  })

  it("refuse two people with alike names", () => {
    const person = db.prepare(
      "INSERT INTO people (id, name, key) VALUES (?, ?, ?)"
    )
    person.run("person-a", "Sam Naidoo", normaliseName("Sam Naidoo"))
    expect(() =>
      person.run("person-b", "sam  naidoo", normaliseName("sam  naidoo"))
    ).toThrow(unique)
  })

  it("refuse a duplicate fingerprint", () => {
    const fingerprint = db.prepare(
      "INSERT INTO fingerprints (fingerprint, reason) VALUES (?, 'freedive')"
    )
    fingerprint.run("2025-12-28T10:00:00|12|3.2")
    expect(() => fingerprint.run("2025-12-28T10:00:00|12|3.2")).toThrow(
      /UNIQUE constraint failed/
    )
  })
})

describe("a dive", () => {
  beforeEach(() => site("site-a", "Long Beach", "ZA"))

  const dive = (fields: Record<string, unknown>) => {
    const row = {
      id: "dive-a",
      start_time: "2026-07-22T08:12:00",
      site_id: "site-a",
      duration: 2520,
      max_depth: 32.66,
      ...fields,
    }
    const columns = Object.keys(row)
    db.prepare(
      `INSERT INTO dives (${columns.join(", ")}) VALUES (${columns.map((c) => "@" + c).join(", ")})`
    ).run(row)
  }

  it("needs an existing site", () => {
    expect(() => dive({ site_id: "site-b" })).toThrow(/FOREIGN KEY/)
  })

  it("keeps a local start time with no zone", () => {
    expect(() => dive({ start_time: "2026-07-22T08:12:00Z" })).toThrow(/CHECK/)
    expect(() => dive({ start_time: "2026-07-22 08:12" })).toThrow(/CHECK/)
  })

  it("has oxygen only on nitrox, and always then", () => {
    expect(() => dive({ nitrox: 1 })).toThrow(/CHECK/)
    expect(() => dive({ oxygen: 320 })).toThrow(/CHECK/)
    expect(() => dive({ nitrox: 1, oxygen: 320 })).not.toThrow()
  })

  it("has visibility in metres or as a rating, not both", () => {
    expect(() => dive({ visibility: 12, visibility_rating: "high" })).toThrow(
      /CHECK/
    )
  })

  it("keeps training details only on a training dive", () => {
    expect(() => dive({ training_agency: "PADI" })).toThrow(/CHECK/)
    expect(() =>
      dive({ dive_type: "training", training_agency: "PADI" })
    ).not.toThrow()
  })

  it("keeps temperatures and depths in order", () => {
    expect(() => dive({ min_temperature: 24, max_temperature: 22 })).toThrow(
      /CHECK/
    )
    expect(() => dive({ average_depth: 33 })).toThrow(/CHECK/)
  })
})
