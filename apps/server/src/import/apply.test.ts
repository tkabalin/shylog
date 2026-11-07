import type { ImportApplyRequest, ImportPreview } from "@shylog/core"
import Database from "better-sqlite3"
import { describe, expect, it } from "vitest"

import { testDb } from "../../test/db.ts"
import { logByHand } from "../../test/hand.ts"
import {
  byFixtureNumber,
  d4iXml,
  syntheticXml,
  zoopXml,
} from "../../test/uddf-fixtures.ts"
import { editDive } from "../apply/dive.ts"
import type { Db } from "../db/open.ts"
import { sampleTemperatures } from "../derived.ts"
import { currentVersion } from "../journal.ts"
import { compare } from "../restore/compare.ts"
import { replay } from "../restore/replay.ts"
import { change } from "../routes/change.ts"
import { readUddf } from "../uddf/reader.ts"
import { applyImport, lastImport } from "./apply.ts"
import { fingerprint } from "./fingerprint.ts"
import { pendingPreview, storePreview } from "./preview.ts"

const d4i = readUddf(d4iXml)
const fixture = byFixtureNumber(d4iXml, d4i)
const now = new Date("2026-11-07T10:00:00Z")

// What the review proposes, taken as it stands.
const proposed = (preview: ImportPreview): ImportApplyRequest => ({
  revision: preview.revision,
  pairs: preview.pairs.map(({ computerDive, diveId }) => ({
    computerDive: computerDive.ref,
    diveId,
  })),
  add: preview.newDives.map((dive) => dive.ref),
  include: [],
})

const refOf = (n: number) => fixture(n).ref
const count = (db: Db, sql: string, ...params: unknown[]) =>
  db
    .prepare(sql)
    .pluck()
    .get(...params) as number
const metaRows = (db: Db, diveId: string) =>
  Object.fromEntries(
    db
      .prepare(
        "SELECT field, source, computer_value AS computerValue FROM field_meta WHERE dive_id = ?"
      )
      .all(diveId)
      .map((row) => {
        const { field, ...rest } = row as { field: string }
        return [field, rest]
      })
  )
const diveRow = (db: Db, id: string) =>
  db.prepare("SELECT * FROM dives WHERE id = ?").get(id) as Record<
    string,
    unknown
  >
const printed = (db: Db, n: number) =>
  db
    .prepare(
      "SELECT dive_id AS diveId, reason FROM fingerprints WHERE fingerprint = ?"
    )
    .get(fingerprint(fixture(n))) as
    { diveId: string | null; reason: string } | undefined

// An in-memory copy, as a nightly snapshot would hold.
const copyOf = (db: Db) => {
  const copy = new Database(db.serialize())
  copy.pragma("foreign_keys = ON")
  return copy
}

// Dive 63 logged by hand with every compared figure a little off the
// computer's, and Ignore this dive on; dive 62 with only what the form
// needs, at the computer's own figures.
function handLog() {
  const db = testDb()
  const { startTime, duration, maxDepth } = fixture(62)
  logByHand(db, [
    { id: "dive-62", startTime, duration, maxDepth },
    {
      id: "dive-63",
      startTime: "2026-07-22T08:10:00",
      duration: 2520,
      maxDepth: 32.7,
      averageDepth: 21,
      minTemperature: 20,
      maxTemperature: 23,
      weight: 4,
      notes: "Potato bass at the drop-off",
      ignored: true,
    },
  ])
  return db
}

// Whole exports are imported here, which takes seconds under CI's coverage.
describe("applyImport on the D4i export", { timeout: 20_000 }, () => {
  // One new dive skipped and one freedive included, beside the proposal.
  const choices = (preview: ImportPreview): ImportApplyRequest => {
    const request = proposed(preview)
    return {
      ...request,
      add: request.add.filter((ref) => ref !== refOf(66)),
      include: [refOf(9)],
    }
  }

  function applied() {
    const db = handLog()
    const snapshot = copyOf(db)
    const preview = storePreview(db, d4iXml, now)
    const result = applyImport(db, preview.id, choices(preview), now)
    return { db, snapshot, preview, result }
  }

  it("counts what it did as the summary lists it", () => {
    const { result } = applied()
    // 42 scuba dives, two paired and one skipped; 26 freedives, one
    // included, and the four under five minutes left out.
    expect(result).toEqual({
      status: "applied",
      paired: 2,
      added: 39,
      alreadyImported: 0,
      leftOut: 29,
      included: 1,
      differing: ["dive-63"],
    })
  })

  it("keeps every hand value of a paired dive and records each differing figure", () => {
    const { db } = applied()
    const dive = diveRow(db, "dive-63")
    expect(dive).toMatchObject({
      start_time: "2026-07-22T08:10:00",
      duration: 2520,
      max_depth: 32.7,
      average_depth: 21,
      min_temperature: 20,
      max_temperature: 23,
      weight: 4,
      notes: "Potato bass at the drop-off",
      ignored: 1,
      number: null,
      computer_model: "Suunto D4i",
    })
    const temperatures = sampleTemperatures(fixture(63).samples)
    expect(metaRows(db, "dive-63")).toMatchObject({
      startTime: { source: "hand", computerValue: "2026-07-22T08:12:19" },
      duration: { source: "hand", computerValue: 2500 },
      maxDepth: { source: "hand", computerValue: 32.66 },
      averageDepth: { source: "hand", computerValue: 21.005 },
      minTemperature: { source: "hand", computerValue: temperatures.min },
      maxTemperature: { source: "hand", computerValue: temperatures.max },
      // The computer's weight and notes are none, and the rest stay.
      weight: { source: "hand", computerValue: null },
      notes: { source: "hand", computerValue: null },
    })
  })

  it("fills a paired dive's empty fields as computer values, and no more", () => {
    const { db } = applied()
    const { averageDepth, samples } = fixture(62)
    const temperatures = sampleTemperatures(samples)
    expect(diveRow(db, "dive-62")).toMatchObject({
      average_depth: averageDepth,
      min_temperature: temperatures.min,
      max_temperature: temperatures.max,
    })
    const meta = metaRows(db, "dive-62")
    for (const field of ["averageDepth", "minTemperature", "maxTemperature"])
      expect(meta[field]).toEqual({ source: "computer", computerValue: null })
    // Equal figures leave nothing to adopt.
    for (const field of ["startTime", "duration", "maxDepth"])
      expect(meta[field]).toEqual({ source: "hand", computerValue: null })
  })

  it("gives paired dives the computer's samples and events, and CNS and OTU from them", () => {
    const { db } = applied()
    for (const n of [62, 63]) {
      const id = `dive-${n}`
      expect(
        count(db, "SELECT count(*) FROM samples WHERE dive_id = ?", id)
      ).toBe(fixture(n).samples.length)
      expect(
        count(db, "SELECT count(*) FROM events WHERE dive_id = ?", id)
      ).toBe(fixture(n).events.length)
      const { cns, otu } = diveRow(db, id)
      expect(cns).toBeGreaterThan(0)
      expect(otu).toBeGreaterThan(0)
      expect(
        count(db, "SELECT count(*) FROM import_raw WHERE dive_id = ?", id)
      ).toBe(1)
    }
  })

  it("adds a new dive with the computer's values at the Unknown site", () => {
    const { db } = applied()
    const id = printed(db, 58)!.diveId!
    const { startTime, duration, maxDepth, averageDepth, samples } = fixture(58)
    expect(diveRow(db, id)).toMatchObject({
      start_time: startTime,
      duration,
      max_depth: maxDepth,
      average_depth: averageDepth,
      nitrox: 1,
      oxygen: 320,
      computer_model: "Suunto D4i",
    })
    const meta = metaRows(db, id)
    for (const field of [
      "startTime",
      "duration",
      "maxDepth",
      "averageDepth",
      "minTemperature",
      "maxTemperature",
      "nitrox",
      "oxygen",
    ])
      expect(meta[field], field).toEqual({
        source: "computer",
        computerValue: null,
      })
    // No one chose the site, so it is free to replace.
    expect(meta.siteId).toBeUndefined()
    expect(
      db
        .prepare(
          "SELECT name, country_code AS countryCode FROM sites WHERE id = ?"
        )
        .get(diveRow(db, id).site_id)
    ).toEqual({ name: "Unknown site", countryCode: "ZA" })
    expect(count(db, "SELECT count(*) FROM sites")).toBe(2)
    expect(
      count(db, "SELECT count(*) FROM samples WHERE dive_id = ?", id)
    ).toBe(samples.length)
  })

  it("fingerprints every dive it saw but the skipped one", () => {
    const { db } = applied()
    expect(printed(db, 66)).toBeUndefined()
    expect(printed(db, 63)).toEqual({ diveId: "dive-63", reason: "paired" })
    expect(printed(db, 10)).toEqual({ diveId: null, reason: "freedive" })
    expect(printed(db, 6)).toEqual({ diveId: null, reason: "short" })
    expect(count(db, "SELECT count(*) FROM fingerprints")).toBe(71)
  })

  it("makes an included freedive a dive", () => {
    const { db } = applied()
    const { diveId, reason } = printed(db, 9)!
    expect(reason).toBe("added")
    expect(diveRow(db, diveId!)).toMatchObject({
      start_time: fixture(9).startTime,
      duration: fixture(9).duration,
    })
  })

  it("commits in chunks of 50, journalled with what a replay needs", () => {
    const { db, snapshot, preview } = applied()
    expect(
      db
        .prepare("SELECT op_id FROM ops WHERE type = 'importChunk'")
        .pluck()
        .all()
    ).toEqual([`${preview.id}:1`, `${preview.id}:2`])
    expect(pendingPreview(db, now)).toBeNull()
    replay(snapshot, db)
    expect(compare(snapshot, db)).toEqual([])
  })

  it("changes nothing when the same import is applied again", () => {
    const { db, preview, result } = applied()
    const version = currentVersion(db)
    const ops = count(db, "SELECT count(*) FROM ops")
    expect(applyImport(db, preview.id, choices(preview), now)).toEqual(result)
    expect(currentVersion(db)).toBe(version)
    expect(count(db, "SELECT count(*) FROM ops")).toBe(ops)
    expect(lastImport(db)).toMatchObject({ id: preview.id, complete: true })
  })
})

// The gas is compared as one value: fixture dives 61
// (EAN33), 62 (air), 63 (EAN32) and 64 (air), each logged by hand.
describe("applyImport comparing the gas", { timeout: 20_000 }, () => {
  function gasLog() {
    const db = testDb()
    const at = (n: number, gas: { nitrox: boolean; oxygen?: number }) => {
      const { startTime, duration, maxDepth } = fixture(n)
      return { id: `dive-${n}` as const, startTime, duration, maxDepth, ...gas }
    }
    logByHand(db, [
      at(61, { nitrox: true, oxygen: 320 }),
      at(62, { nitrox: true, oxygen: 320 }),
      // The new-dive default, left alone on the boat.
      at(63, { nitrox: false }),
      at(64, { nitrox: false }),
    ])
    const snapshot = copyOf(db)
    const preview = storePreview(db, d4iXml, now)
    const result = applyImport(db, preview.id, proposed(preview), now)
    return { db, snapshot, result }
  }
  const gasOf = (db: Db, id: string) => {
    const { nitrox, oxygen } = diveRow(db, id)
    return { nitrox, oxygen }
  }

  it("gives a hand Nitrox no the computer's nitrox, as a computer value", () => {
    const { db } = gasLog()
    expect(gasOf(db, "dive-63")).toEqual({ nitrox: 1, oxygen: 320 })
    expect(metaRows(db, "dive-63")).toMatchObject({
      nitrox: { source: "computer", computerValue: null },
      oxygen: { source: "computer", computerValue: null },
    })
  })

  it("keeps a hand nitrox mix and flags a whole per cent apart", () => {
    const { db, result } = gasLog()
    expect(gasOf(db, "dive-61")).toEqual({ nitrox: 1, oxygen: 320 })
    expect(metaRows(db, "dive-61").oxygen).toEqual({
      source: "hand",
      computerValue: 330,
    })
    expect(result).toMatchObject({ status: "applied" })
    expect(result.status === "applied" && result.differing).toContain("dive-61")
  })

  it("keeps a hand nitrox mix against the computer's air, flagged", () => {
    const { db } = gasLog()
    expect(gasOf(db, "dive-62")).toEqual({ nitrox: 1, oxygen: 320 })
    expect(metaRows(db, "dive-62").oxygen).toEqual({
      source: "hand",
      computerValue: 210,
    })
  })

  it("leaves air against air alone", () => {
    const { db } = gasLog()
    expect(gasOf(db, "dive-64")).toEqual({ nitrox: 0, oxygen: null })
    expect(metaRows(db, "dive-64").oxygen).toBeUndefined()
  })

  it("doesn't flag an analysed mix the computer rounds to the same per cent", () => {
    const db = testDb()
    const { startTime, duration, maxDepth } = fixture(63)
    logByHand(db, [
      {
        id: "dive-63",
        startTime,
        duration,
        maxDepth,
        nitrox: true,
        oxygen: 324,
      },
    ])
    const preview = storePreview(db, d4iXml, now)
    applyImport(db, preview.id, proposed(preview), now)
    expect(gasOf(db, "dive-63")).toEqual({ nitrox: 1, oxygen: 324 })
    expect(metaRows(db, "dive-63").oxygen).toEqual({
      source: "hand",
      computerValue: null,
    })
  })

  it("leaves a gas v1 can't hold uncompared, as it is stored as air", () => {
    // The export's EAN32 made a trimix, which a hand EAN32 isn't compared to.
    const trimix = d4iXml.replace(
      "<o2>0.32</o2>\n      <he>0.00</he>",
      "<o2>0.18</o2>\n      <he>0.45</he>"
    )
    const db = testDb()
    const { startTime, duration, maxDepth } = fixture(63)
    logByHand(db, [
      {
        id: "dive-63",
        startTime,
        duration,
        maxDepth,
        nitrox: true,
        oxygen: 320,
      },
    ])
    const preview = storePreview(db, trimix, now)
    applyImport(db, preview.id, proposed(preview), now)
    expect(gasOf(db, "dive-63")).toEqual({ nitrox: 1, oxygen: 320 })
    expect(metaRows(db, "dive-63").oxygen).toEqual({
      source: "hand",
      computerValue: null,
    })
  })

  it("replays a chunk journalled before the gas was compared as it was", () => {
    const { db, snapshot } = gasLog()
    const restored = copyOf(snapshot)
    replay(snapshot, db)
    expect(compare(snapshot, db)).toEqual([])
    // An older entry has no gasCompared, and its hand Nitrox no stood.
    db.exec(
      "UPDATE ops SET payload = json_remove(payload, '$.gasCompared') WHERE type = 'importChunk'"
    )
    replay(restored, db)
    expect(gasOf(restored, "dive-63")).toEqual({ nitrox: 0, oxygen: null })
  })
})

describe(
  "applyImport against a log changed since the preview",
  { timeout: 20_000 },
  () => {
    it("returns a hand dive edited since, before anything commits", () => {
      const db = handLog()
      const preview = storePreview(db, d4iXml, now)
      change(
        db,
        () => editDive(db, "dive-62", { fields: { notes: "Edited later" } }),
        { type: "editDive", payload: {} }
      )
      const version = currentVersion(db)
      expect(applyImport(db, preview.id, proposed(preview), now)).toEqual({
        status: "changed",
        diveIds: ["dive-62"],
      })
      expect(currentVersion(db)).toBe(version)
      expect(count(db, "SELECT count(*) FROM fingerprints")).toBe(0)
      // The same request again, as after a lost reply, is told again.
      expect(applyImport(db, preview.id, proposed(preview), now)).toEqual({
        status: "changed",
        diveIds: ["dive-62"],
      })
      expect(count(db, "SELECT count(*) FROM fingerprints")).toBe(0)
      // The review asked again, so the next apply goes ahead.
      const asked = pendingPreview(db, now)!
      expect(asked.revision).toBe(preview.revision + 1)
      expect(asked.pairs.map((pair) => pair.diveId).sort()).toEqual([
        "dive-62",
        "dive-63",
      ])
      expect(applyImport(db, preview.id, proposed(asked), now)).toMatchObject({
        status: "applied",
        paired: 2,
      })
      expect(diveRow(db, "dive-62").notes).toBe("Edited later")
    })

    it("refuses a dive paired by hand that has a computer dive since", () => {
      const db = handLog()
      // On no day the export has, so the preview never read it.
      logByHand(db, [
        {
          id: "dive-old",
          startTime: "2020-01-01T09:00:00",
          duration: 2400,
          maxDepth: 12,
        },
      ])
      const preview = storePreview(db, d4iXml, now)
      db.prepare(
        "INSERT INTO fingerprints (fingerprint, dive_id, reason) VALUES ('x', 'dive-old', 'paired')"
      ).run()
      // Off the export's days, as a pairing made by hand can be.
      expect(() =>
        applyImport(
          db,
          preview.id,
          {
            revision: preview.revision,
            pairs: [{ computerDive: refOf(1), diveId: "dive-old" }],
            add: [],
            include: [],
          },
          now
        )
      ).toThrow("A dive paired by hand was deleted or has a computer dive")
    })

    it("refuses dives the preview doesn't hold, or in the wrong list", () => {
      const db = handLog()
      const preview = storePreview(db, d4iXml, now)
      const apply = (request: Partial<ImportApplyRequest>) => () =>
        applyImport(
          db,
          preview.id,
          { revision: 0, pairs: [], add: [], include: [], ...request },
          now
        )
      expect(apply({ add: ["nothing"] })).toThrow("No dive nothing")
      expect(apply({ add: [refOf(9)] })).toThrow("include it instead")
      expect(apply({ include: [refOf(66)] })).toThrow("add it instead")
      expect(() => applyImport(db, "import-gone", proposed(preview))).toThrow(
        "No such import waiting"
      )
    })
  }
)

describe("applyImport on a Zoop Novo export", { timeout: 20_000 }, () => {
  it("leaves out its dives under five minutes with reason short", () => {
    const db = testDb()
    const preview = storePreview(db, zoopXml, now)
    expect(applyImport(db, preview.id, proposed(preview), now)).toMatchObject({
      status: "applied",
      paired: 0,
      added: 28,
      leftOut: 33,
    })
    const zoop = byFixtureNumber(zoopXml, readUddf(zoopXml))
    for (const n of [42, 53, 54])
      expect(
        db
          .prepare("SELECT reason FROM fingerprints WHERE fingerprint = ?")
          .pluck()
          .get(fingerprint(zoop(n)))
      ).toBe("short")
  })
})

describe("applyImport of 120 dives", { timeout: 20_000 }, () => {
  const many = syntheticXml("many.uddf")
  const chunkIds = (db: Db) =>
    db
      .prepare("SELECT op_id FROM ops WHERE type = 'importChunk' ORDER BY seq")
      .pluck()
      .all()

  it("commits three chunks of at most 50, one journal entry each", () => {
    const db = testDb()
    const preview = storePreview(db, many, now)
    expect(applyImport(db, preview.id, proposed(preview), now)).toMatchObject({
      status: "applied",
      added: 120,
    })
    expect(chunkIds(db)).toEqual([1, 2, 3].map((n) => `${preview.id}:${n}`))
    expect(count(db, "SELECT count(*) FROM dives")).toBe(120)
  })

  it("keeps the chunks before a failure, says so, and carries on when retried", () => {
    const db = testDb()
    const preview = storePreview(db, many, now)
    db.exec(`CREATE TEMP TRIGGER fail AFTER INSERT ON fingerprints
      WHEN (SELECT count(*) FROM fingerprints) > 50
      BEGIN SELECT RAISE(ABORT, 'The disk is full'); END`)
    expect(applyImport(db, preview.id, proposed(preview), now)).toEqual({
      status: "failed",
      error: "The disk is full",
      applied: {
        paired: 0,
        added: 50,
        alreadyImported: 0,
        leftOut: 0,
        included: 0,
        differing: [],
      },
    })
    expect(count(db, "SELECT count(*) FROM dives")).toBe(50)
    expect(chunkIds(db)).toEqual([`${preview.id}:1`])
    // The 50 applied count as imported, so the review offers the rest.
    expect(pendingPreview(db, now)).toMatchObject({
      id: preview.id,
      alreadyImported: 50,
      newDives: expect.toSatisfy((dives: unknown[]) => dives.length === 70),
    })

    db.exec("DROP TRIGGER fail")
    expect(applyImport(db, preview.id, proposed(preview), now)).toMatchObject({
      status: "applied",
      added: 120,
    })
    expect(count(db, "SELECT count(*) FROM dives")).toBe(120)
    expect(chunkIds(db)).toEqual([1, 2, 3].map((n) => `${preview.id}:${n}`))
  })

  it("unpairs a proposed pair whose hand dive went to another computer dive", () => {
    const db = testDb()
    const [first, second] = readUddf(many)
    const hand = (id: `dive-${string}`, dive: typeof first) => ({
      id,
      startTime: dive.startTime,
      duration: dive.duration,
      maxDepth: dive.maxDepth,
    })
    logByHand(db, [hand("dive-a", first), hand("dive-b", second)])
    const preview = storePreview(db, many, now)
    expect(preview.pairs.map((pair) => pair.diveId)).toEqual([
      "dive-a",
      "dive-b",
    ])
    // The second computer dive paired with the first hand dive, the first
    // computer dive skipped, and the import stopped after a chunk.
    db.exec(`CREATE TEMP TRIGGER fail AFTER INSERT ON fingerprints
      WHEN (SELECT count(*) FROM fingerprints) > 50
      BEGIN SELECT RAISE(ABORT, 'The disk is full'); END`)
    const request = proposed(preview)
    expect(
      applyImport(
        db,
        preview.id,
        {
          ...request,
          pairs: [{ computerDive: second.ref, diveId: "dive-a" }],
        },
        now
      )
    ).toMatchObject({ status: "failed", applied: { paired: 1 } })
    const left = pendingPreview(db, now)!
    expect(left.pairs).toEqual([])
    expect(left.newDives.map((dive) => dive.ref)).toContain(first.ref)
  })
})

describe("applyImport on another program's file", () => {
  // Two buddies one person matches, a site the log already has with a
  // region the log doesn't, and a site in no country.
  const file = `<?xml version="1.0"?>
<uddf xmlns="http://www.streit.cc/uddf/3.2/" version="3.2.1">
  <generator><name>Another logbook</name></generator>
  <diver>
    <buddy id="b1"><personal><firstname>Sam</firstname><lastname>Naidoo</lastname></personal></buddy>
    <buddy id="b2"><personal><firstname>sam</firstname><lastname>naidoo</lastname></personal></buddy>
  </diver>
  <divesite>
    <site id="s1"><name>Two Mile Reef</name><geography><location>Sodwana</location><address><country>ZA</country></address></geography></site>
    <site id="s2"><name>Blue Hole</name></site>
  </divesite>
  <profiledata><repetitiongroup id="g">${["s1", "s2"]
    .map(
      (site, i) => `
    <dive id="d${i}">
      <informationbeforedive>
        <link ref="b1"/><link ref="b2"/><link ref="${site}"/>
        <datetime>2026-08-0${i + 1}T09:00:00</datetime>
      </informationbeforedive>
      <samples>
        <waypoint><depth>1</depth><divetime>0</divetime></waypoint>
        <waypoint><depth>10</depth><divetime>600</divetime></waypoint>
      </samples>
      <informationafterdive>
        <greatestdepth>10</greatestdepth><diveduration>1800</diveduration>
      </informationafterdive>
    </dive>`
    )
    .join("")}
  </repetitiongroup></profiledata>
</uddf>`

  it("makes only the entities its dives take", () => {
    const db = testDb()
    // The log's Two Mile Reef, with no region.
    logByHand(db, [
      {
        id: "dive-old",
        startTime: "2026-01-01T09:00:00",
        duration: 2400,
        maxDepth: 12,
      },
    ])
    const preview = storePreview(db, file, now)
    expect(applyImport(db, preview.id, proposed(preview), now)).toMatchObject({
      status: "applied",
      added: 2,
    })
    const sites = db
      .prepare(
        "SELECT d.start_time, s.id, s.name, s.country_code, m.source FROM dives d JOIN sites s ON s.id = d.site_id LEFT JOIN field_meta m ON m.dive_id = d.id AND m.field = 'siteId' ORDER BY d.start_time"
      )
      .raw()
      .all()
    expect(sites).toEqual([
      ["2026-01-01T09:00:00", "site-reef", "Two Mile Reef", "ZA", "hand"],
      ["2026-08-01T09:00:00", "site-reef", "Two Mile Reef", "ZA", "computer"],
      // In no country, so placed like the Unknown site and free to change.
      ["2026-08-02T09:00:00", expect.any(String), "Blue Hole", "ZA", null],
    ])
    expect(count(db, "SELECT count(*) FROM regions")).toBe(0)
    expect(db.prepare("SELECT name FROM people").pluck().all()).toEqual([
      "Sam Naidoo",
    ])
  })
})
