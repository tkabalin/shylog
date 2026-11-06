import { describe, expect, it } from "vitest"

import { testDb } from "../../test/db.ts"
import { logByHand } from "../../test/hand.ts"
import {
  byFixtureNumber,
  d4iXml,
  syntheticXml,
  zoopXml,
} from "../../test/uddf-fixtures.ts"
import { readUddf } from "../uddf/reader.ts"
import { fingerprint } from "./fingerprint.ts"
import { pairDay } from "./pairing.ts"
import { buildPreview } from "./preview.ts"

const d4i = readUddf(d4iXml)
const fixture = byFixtureNumber(d4iXml, d4i)
const now = new Date("2026-11-06T10:00:00Z")

describe("pairDay", () => {
  const dive63 = fixture(63)
  const logged = {
    startTime: "2026-07-22T08:10:00",
    maxDepth: 32.7,
    averageDepth: null,
  }

  it("pairs dive 63 with a hand dive at 08:10 for 42 min to 32.7 m", () => {
    const right = { ...logged, id: "dive-right" as const, duration: 42 * 60 }
    const short = { ...logged, id: "dive-short" as const, duration: 20 * 60 }
    expect(pairDay([short, right], [dive63])).toEqual(
      new Map([[dive63.ref, "dive-right"]])
    )
    expect(pairDay([short], [dive63]).size).toBe(0)
  })
})

describe("buildPreview", () => {
  it("pairs three hand dives on 20 July with fixture 58, 59 and 60 by closest start", () => {
    const db = testDb()
    // 59 and 60 are alike enough that either hand dive passes with either;
    // only the start tells them apart.
    logByHand(db, [
      {
        id: "dive-a",
        startTime: "2026-07-20T08:05:00",
        duration: 2160,
        maxDepth: 32.6,
      },
      {
        id: "dive-b",
        startTime: "2026-07-20T09:55:00",
        duration: 3600,
        maxDepth: 15,
      },
      {
        id: "dive-c",
        startTime: "2026-07-20T12:00:00",
        duration: 3600,
        maxDepth: 15,
      },
    ])
    const preview = buildPreview(db, d4iXml, now)
    const pairs = preview.pairs.map((pair) => [
      pair.computerDive.ref,
      pair.diveId,
    ])
    expect(pairs).toEqual([
      [fixture(58).ref, "dive-a"],
      [fixture(59).ref, "dive-b"],
      [fixture(60).ref, "dive-c"],
    ])
    expect(preview.days.find((day) => day.date === "2026-07-20")).toEqual({
      date: "2026-07-20",
      estimatedOffset: 0,
      offset: 0,
    })
  })

  it("lists a hand dive no computer dive passes with, and how far the nearest starts", () => {
    const db = testDb()
    logByHand(db, [
      {
        id: "dive-late",
        startTime: "2026-07-20T14:00:00",
        duration: 1800,
        maxDepth: 6,
      },
      // A day the export has no dives on isn't listed at all.
      {
        id: "dive-other",
        startTime: "2026-07-23T09:00:00",
        duration: 1800,
        maxDepth: 6,
      },
    ])
    const preview = buildPreview(db, d4iXml, now)
    // Dive 60 starts at 11:59:25, 2 h 0 min 35 s earlier.
    expect(preview.unpaired).toEqual([
      { diveId: "dive-late", day: "2026-07-20", nearestStartGap: 7235 },
    ])
    expect(preview.newDives.map((dive) => dive.ref)).toContain(fixture(60).ref)
  })

  it("only counts computer dives already fingerprinted, and skips their hand dives", () => {
    const db = testDb()
    logByHand(db, [
      {
        id: "dive-done",
        startTime: "2026-07-22T08:10:00",
        duration: 2520,
        maxDepth: 32.7,
      },
    ])
    db.prepare(
      "INSERT INTO fingerprints (fingerprint, dive_id, reason) VALUES (?, ?, 'paired'), (?, NULL, 'freedive')"
    ).run(fingerprint(fixture(63)), "dive-done", fingerprint(fixture(9)))
    const preview = buildPreview(db, d4iXml, now)
    expect(preview.alreadyImported).toBe(2)
    const refs = [
      ...preview.pairs.map((pair) => pair.computerDive.ref),
      ...preview.newDives.map((dive) => dive.ref),
      ...preview.leftOut.map((dive) => dive.ref),
    ]
    expect(refs).not.toContain(fixture(63).ref)
    expect(refs).not.toContain(fixture(9).ref)
    expect(refs).toHaveLength(70)
    expect(preview.unpaired).toEqual([])
  })

  it("names the computer even when every dive is already imported", () => {
    const db = testDb()
    const file = syntheticXml("midnight.uddf")
    db.prepare(
      "INSERT INTO fingerprints (fingerprint, dive_id, reason) VALUES (?, NULL, 'freedive')"
    ).run(fingerprint(readUddf(file)[0]))
    const preview = buildPreview(db, file, now)
    expect(preview.alreadyImported).toBe(1)
    expect(preview.computerModel).toBe("Suunto D4i")
  })

  it("counts a dive the file holds twice once, as already imported", () => {
    const original = d4iXml.match(/<dive id="id181">[\s\S]*?<\/dive>/)![0]
    const file = d4iXml.replace(
      original,
      original + original.replace('id="id181"', 'id="again"')
    )
    const preview = buildPreview(testDb(), file, now)
    expect(preview.alreadyImported).toBe(1)
    expect(preview.newDives.map((dive) => dive.ref)).toContain("id181")
    expect(preview.newDives.map((dive) => dive.ref)).not.toContain("again")
  })

  it("never proposes a freedive or a dive under five minutes", () => {
    const db = testDb()
    const freedive = fixture(9)
    logByHand(db, [
      {
        id: "dive-free",
        startTime: freedive.startTime,
        duration: freedive.duration,
        maxDepth: freedive.maxDepth,
      },
    ])
    const preview = buildPreview(db, d4iXml, now)
    expect(preview.pairs).toEqual([])
    expect(preview.newDives).toHaveLength(42)
    expect(preview.leftOut).toHaveLength(30)
    const reasons = (dives: typeof preview.leftOut, reason: string) =>
      dives.filter((dive) => dive.reason === reason).length
    expect(reasons(preview.leftOut, "freedive")).toBe(26)
    expect(reasons(preview.leftOut, "short")).toBe(4)
    expect(preview.unpaired.map((dive) => dive.diveId)).toEqual(["dive-free"])

    const zoop = buildPreview(testDb(), zoopXml, now)
    expect(zoop.newDives).toHaveLength(28)
    expect(reasons(zoop.leftOut, "freedive")).toBe(30)
    expect(reasons(zoop.leftOut, "short")).toBe(3)
  })
})
