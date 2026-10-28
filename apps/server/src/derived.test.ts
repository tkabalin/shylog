import { opVersion } from "@shylog/core"
import { beforeEach, describe, expect, it } from "vitest"

import { send, testApp } from "../test/app.ts"
import { diveId, seededDb } from "../test/fixture.ts"
import type { Db } from "./db/open.ts"

// 20 July 2026 at Sodwana, one 12-hour CNS chain: fixture dive 58 on
// EANx32, then two air dives.
const first = "2026-07-20T08:05:44"
const second = "2026-07-20T09:57:21"
const nextDay = "2026-07-21T07:47:42"

let db: Db
let app: ReturnType<typeof testApp>
let sodwana: string
beforeEach(() => {
  db = seededDb()
  app = testApp({ db })
  sodwana = db
    .prepare("SELECT id FROM sites WHERE name = 'Sodwana'")
    .pluck()
    .get() as string
})

const at = (startTime: string) =>
  db
    .prepare(
      "SELECT id, number, surface_interval AS surfaceInterval, average_depth AS averageDepth, cns FROM dives WHERE start_time = ?"
    )
    .get(startTime) as {
    id: string
    number: number | null
    surfaceInterval: number | null
    averageDepth: number | null
    cns: number | null
  }

let ops = 0
async function addDive(diveId: string, startTime: string, duration = 1200) {
  const res = await send(app, "POST", "/api/ops", {
    ops: [
      {
        opId: `op-${++ops}`,
        opVersion,
        deviceId: "device-phone",
        at: new Date().toISOString(),
        type: "upsertDive",
        diveId,
        fields: { startTime, siteId: sodwana, duration, maxDepth: 12 },
      },
    ],
  })
  expect(res.status).toBe(200)
}

const patch = async (startTime: string, fields: Record<string, unknown>) =>
  expect(
    (await send(app, "PATCH", `/api/dives/${at(startTime).id}`, { fields }))
      .status
  ).toBe(200)

describe("the derived pass after each write", () => {
  it("numbers dives by local start time, after an insert, a delete and a restore", async () => {
    expect(at(second).number).toBe(33)
    await addDive("dive-between", "2026-07-20T09:00:00")
    expect(at("2026-07-20T09:00:00").number).toBe(33)
    expect(at(second).number).toBe(34)

    await send(app, "DELETE", "/api/dives/dive-between")
    expect(at("2026-07-20T09:00:00").number).toBeNull()
    expect(at(second).number).toBe(33)
    await send(app, "POST", "/api/dives/dive-between/restore")
    expect(at(second).number).toBe(34)
  })

  it("gives an ignored dive no number but keeps it for intervals and CNS", async () => {
    const before = at(second)
    await patch(first, { ignored: true })
    expect(at(first).number).toBeNull()
    expect(at(second)).toEqual({ ...before, number: 32 })
    await patch(first, { ignored: false })
    expect(at(first).number).toBe(32)
    expect(at(second).number).toBe(33)
  })

  it("recalculates the next dive's surface interval unless it is overridden", async () => {
    expect(at(second).surfaceInterval).toBe(4505)
    await addDive("dive-between", "2026-07-20T09:00:00", 1200)
    // From 09:20:00 to 09:57:21.
    expect(at(second).surfaceInterval).toBe(2241)

    await patch(second, { surfaceInterval: 5000 })
    await send(app, "DELETE", "/api/dives/dive-between")
    expect(at(second).surfaceInterval).toBe(5000)
    await patch(second, { surfaceInterval: null })
    expect(at(second).surfaceInterval).toBe(4505)
  })

  // The first dive runs 08:05:44 to 08:42:16; its samples end by then, so a
  // longer duration moves its end.
  const moved = "2026-07-20T08:15:44"

  it("recalculates the next dive's interval when the dive before it moves", async () => {
    await patch(first, { startTime: moved })
    // From 08:52:16 to 09:57:21.
    expect(at(second).surfaceInterval).toBe(3905)
  })

  it("recalculates the next dive's interval when the dive before it lengthens", async () => {
    await patch(first, { duration: 3000 })
    // From 08:55:44 to 09:57:21.
    expect(at(second).surfaceInterval).toBe(3697)
  })

  it("keeps a hand interval through changes to the dive before, until set back", async () => {
    await patch(second, { surfaceInterval: 5000 })
    await patch(first, { startTime: moved })
    await patch(moved, { duration: 3000 })
    expect(at(second).surfaceInterval).toBe(5000)
    await patch(second, { surfaceInterval: "none" })
    expect(at(second).surfaceInterval).toBeNull()

    await patch(second, { surfaceInterval: null })
    // From 09:05:44 to 09:57:21.
    expect(at(second).surfaceInterval).toBe(3097)
  })

  it("calculates average depth only for dives with samples and no imported or hand value", async () => {
    await addDive("dive-by-hand", "2026-10-01T10:00:00")
    expect(at("2026-10-01T10:00:00").averageDepth).toBeNull()

    // As an import of a dive with no averagedepth would leave it.
    const id = diveId(db, 63)
    db.prepare(
      "DELETE FROM field_meta WHERE dive_id = ? AND field = 'averageDepth'"
    ).run(id)
    await patch(nextDay, { notes: "Any write" })
    const calculated = at("2026-07-22T08:12:19").averageDepth
    expect(calculated).not.toBe(21.005)
    expect(calculated).toBeGreaterThan(15)

    await send(app, "PATCH", `/api/dives/${id}`, {
      fields: { averageDepth: 15 },
    })
    await patch(nextDay, { notes: "Another write" })
    expect(at("2026-07-22T08:12:19").averageDepth).toBe(15)
    // An imported value stays as the computer gave it.
    expect(at(first).averageDepth).toBe(23.98)
  })

  it("leaves no calculated average deeper than a hand max depth", async () => {
    const id = diveId(db, 63)
    db.prepare(
      "DELETE FROM field_meta WHERE dive_id = ? AND field = 'averageDepth'"
    ).run(id)
    const res = await send(app, "PATCH", `/api/dives/${id}`, {
      fields: { maxDepth: 5 },
    })
    expect(res.status).toBe(200)
    expect(at("2026-07-22T08:12:19").averageDepth).toBeNull()
  })

  it("recalculates CNS carry-over for the later dives in the 12-hour chain", async () => {
    expect(at(second).cns).toBe(10)
    expect(at(nextDay).cns).toBe(18)
    await patch(first, { nitrox: false })
    expect(at(first).cns).toBeLessThan(16)
    expect(at(second).cns).toBeLessThan(10)
    // Over 12 hours later, so outside the chain.
    expect(at(nextDay).cns).toBe(18)
  })

  it("recalculates a dive's chain when it moves into a trip", async () => {
    db.prepare(
      "INSERT INTO trips (id, name, key) VALUES ('trip-sodwana', 'Sodwana 2026', 'sodwana 2026')"
    ).run()
    await patch(second, { tripId: "trip-sodwana" })
    // The dive before it is in no trip, so it carries nothing over.
    expect(at(second).cns).toBeLessThan(10)
    await patch(first, { tripId: "trip-sodwana" })
    expect(at(second).cns).toBe(10)
  })
})
