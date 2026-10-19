import { beforeAll, describe, expect, it } from "vitest"

import { apiHeaders, testApp } from "../../test/app.ts"
import { diveId, seededDb } from "../../test/fixture.ts"
import type { Db } from "../db/open.ts"

let db: Db
let app: ReturnType<typeof testApp>
beforeAll(() => {
  db = seededDb()
  app = testApp({ db })
})

interface Profile {
  samples: {
    time: number
    depth: number
    temperature: number | null
    pressure: number | null
  }[]
  events: { type: string; start: number; end: number | null }[]
}

const profile = async (id: string) => {
  const res = await app.request(`/api/dives/${id}/samples`, {
    headers: apiHeaders,
  })
  expect(res.status).toBe(200)
  return (await res.json()) as Profile
}

describe("GET /api/dives/:id/samples", () => {
  it("returns merged samples with the temperature carried forward", async () => {
    const { samples } = await profile(diveId(db, 3))
    const times = samples.map((sample) => sample.time)
    // Dive 3 repeats five times in the export.
    expect(new Set(times).size).toBe(times.length)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(samples.every((sample) => sample.temperature != null)).toBe(true)
    expect(samples.every((sample) => sample.pressure === null)).toBe(true)
  })

  it("returns ascent alarms as spans and surface events as points", async () => {
    const { events } = await profile(diveId(db, 3))
    expect(events.find((event) => event.type === "ascent")).toEqual({
      type: "ascent",
      start: 290,
      end: 311,
    })
    expect(events.filter((event) => event.type === "surface")).not.toHaveLength(
      0
    )
    expect(
      events.every((event) => event.type !== "surface" || event.end === null)
    ).toBe(true)
  })

  it("has 59 ascent events across the seeded dives, each with an end", async () => {
    const ids = db.prepare("SELECT id FROM dives").pluck().all() as string[]
    const ascents = (await Promise.all(ids.map(profile))).flatMap(
      ({ events }) => events.filter((event) => event.type === "ascent")
    )
    expect(ascents).toHaveLength(59)
    expect(ascents.every((event) => event.end! > event.start)).toBe(true)
  })

  it("is 404 for an unknown dive", async () => {
    const res = await app.request("/api/dives/dive-missing/samples", {
      headers: apiHeaders,
    })
    expect(res.status).toBe(404)
  })
})
