import { describe, expect, it } from "vitest"

import { testDb } from "../../test/db.ts"
import { logByHand } from "../../test/hand.ts"
import {
  byFixtureNumber,
  d4iXml,
  syntheticXml,
} from "../../test/uddf-fixtures.ts"
import { currentVersion } from "../journal.ts"
import { readUddf } from "../uddf/reader.ts"
import { dateOf } from "./offset.ts"
import {
  discardPreview,
  pendingPreview,
  purgeExpiredPreviews,
  setDayOffset,
  storePreview,
} from "./preview.ts"

const d4i = readUddf(d4iXml)
const fixture = byFixtureNumber(d4iXml, d4i)
const abroad = syntheticXml("abroad.uddf")
const now = new Date("2026-11-06T10:00:00Z")
const later = (ms: number) => new Date(now.getTime() + ms)
const week = 7 * 24 * 60 * 60 * 1000

// Dives 51 to 66 logged by hand at their real site times, which the
// abroad export has five hours behind from the 17th to the 22nd.
function tripLog() {
  const db = testDb()
  logByHand(
    db,
    Array.from({ length: 16 }, (_, i) => {
      const { startTime, duration, maxDepth } = fixture(51 + i)
      return { id: `dive-${51 + i}` as const, startTime, duration, maxDepth }
    })
  )
  return db
}
const opsCount = (db: ReturnType<typeof testDb>) =>
  db.prepare("SELECT count(*) FROM ops").pluck().get()

describe("storePreview", () => {
  it("stores the data version and the file without writing to the log", () => {
    const db = tripLog()
    const [version, ops] = [currentVersion(db), opsCount(db)]
    const preview = storePreview(db, abroad, now)
    expect(preview.basedOnVersion).toBe(version)
    expect(currentVersion(db)).toBe(version)
    expect(opsCount(db)).toBe(ops)
    expect(preview.pairs).toHaveLength(16)
    // Every dive starts on the day it is reviewed under.
    for (const dive of [
      ...preview.pairs.map((pair) => pair.computerDive),
      ...preview.newDives,
      ...preview.leftOut,
    ])
      expect(dateOf(dive.startTime)).toBe(dive.day)
    expect(db.prepare("SELECT uddf FROM import_previews").pluck().get()).toBe(
      abroad
    )
  })

  it("expires after seven days, and is purged once expired", () => {
    const db = tripLog()
    const preview = storePreview(db, abroad, now)
    const count = () =>
      db.prepare("SELECT count(*) FROM import_previews").pluck().get()
    expect(preview.expiresAt).toBe(later(week).toISOString())
    expect(pendingPreview(db, later(week - 1))?.id).toBe(preview.id)
    purgeExpiredPreviews(db, later(week - 1))
    expect(count()).toBe(1)
    // Reading an expired preview writes nothing, as saving may be paused.
    expect(pendingPreview(db, later(week))).toBeNull()
    expect(count()).toBe(1)
    purgeExpiredPreviews(db, later(week))
    expect(count()).toBe(0)
  })

  it("replaces the preview still waiting", () => {
    const db = tripLog()
    storePreview(db, abroad, now)
    const second = storePreview(db, abroad, later(1000))
    expect(pendingPreview(db, later(2000))?.id).toBe(second.id)
    expect(
      db.prepare("SELECT count(*) FROM import_previews").pluck().get()
    ).toBe(1)
  })
})

describe("setDayOffset", () => {
  const day22 = (refs: string[]) =>
    refs.filter((ref) => ref.startsWith("dive-6"))

  it("proposes that day again with the override and keeps it", () => {
    const db = tripLog()
    const preview = storePreview(db, abroad, now)
    // A change on another day after the preview stays out of it until apply
    // checks again.
    db.prepare("UPDATE dives SET deleted_at = ? WHERE id = 'dive-58'").run(
      now.toISOString()
    )
    const moved = setDayOffset(
      db,
      preview.id,
      { date: "2026-07-22", offset: 0 },
      later(1000)
    )
    expect(moved.days.find((day) => day.date === "2026-07-22")).toEqual({
      date: "2026-07-22",
      estimatedOffset: 300,
      offset: 0,
    })
    expect(moved.pairs.map((pair) => pair.diveId)).toContain("dive-58")
    expect(moved.pairs).toHaveLength(13)
    expect(moved.newDives.map((dive) => dive.startTime)).toEqual([
      "2026-07-22T03:12:19",
      "2026-07-22T04:51:53",
      "2026-07-22T06:49:24",
    ])
    expect(day22(moved.unpaired.map((dive) => dive.diveId))).toEqual([
      "dive-63",
      "dive-64",
      "dive-65",
    ])
    expect(pendingPreview(db, later(2000))).toEqual(moved)

    const reset = setDayOffset(
      db,
      preview.id,
      { date: "2026-07-22", offset: null },
      later(3000)
    )
    expect(reset.days.find((day) => day.date === "2026-07-22")?.offset).toBe(
      300
    )
    expect(reset.pairs).toEqual(preview.pairs)
    expect(reset.newDives).toEqual([])
  })

  it("pairs a logged dive under five minutes, and leaves it out again once unpaired", () => {
    const db = testDb()
    // The D4i's 2-minute dive at 09:25:51 on 7 March 2026, logged by hand.
    logByHand(db, [
      {
        id: "dive-check",
        startTime: "2026-03-07T09:26:00",
        duration: 120,
        maxDepth: 3.2,
      },
    ])
    const preview = storePreview(db, d4iXml, now)
    const blip = preview.pairs.find((pair) => pair.diveId === "dive-check")
    expect(blip?.computerDive.startTime).toBe("2026-03-07T09:25:51")
    expect(preview.leftOut.map((dive) => dive.ref)).not.toContain(
      blip?.computerDive.ref
    )
    const moved = setDayOffset(
      db,
      preview.id,
      { date: "2026-03-07", offset: 60 },
      now
    )
    expect(moved.pairs.map((pair) => pair.diveId)).not.toContain("dive-check")
    expect(moved.leftOut).toContainEqual(
      expect.objectContaining({ ref: blip?.computerDive.ref, reason: "short" })
    )
    expect(moved.newDives.map((dive) => dive.ref)).not.toContain(
      blip?.computerDive.ref
    )
  })

  it("refuses a preview that isn't waiting, or a day it doesn't hold", () => {
    const db = tripLog()
    const preview = storePreview(db, abroad, now)
    expect(() =>
      setDayOffset(db, "import-gone", { date: "2026-07-22", offset: 0 }, now)
    ).toThrow(expect.objectContaining({ status: 404 }))
    expect(() =>
      setDayOffset(db, preview.id, { date: "2026-07-23", offset: 0 }, now)
    ).toThrow(expect.objectContaining({ status: 400 }))
    expect(() =>
      setDayOffset(
        db,
        preview.id,
        { date: "2026-07-22", offset: 0 },
        later(week)
      )
    ).toThrow(expect.objectContaining({ status: 404 }))
  })
})

describe("discardPreview", () => {
  it("discards the preview, and changes nothing a second time", () => {
    const db = tripLog()
    const preview = storePreview(db, abroad, now)
    discardPreview(db, preview.id)
    expect(pendingPreview(db, now)).toBeNull()
    expect(() => discardPreview(db, preview.id)).not.toThrow()
  })
})
