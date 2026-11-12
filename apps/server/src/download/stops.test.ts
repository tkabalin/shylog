import { readdirSync, readFileSync } from "node:fs"

import Database from "better-sqlite3"
import { describe, expect, it } from "vitest"

import { testDb } from "../../test/db.ts"
import { d4iXml } from "../../test/uddf-fixtures.ts"
import { applyImport } from "../import/apply.ts"
import { storePreview } from "../import/preview.ts"
import type { Db } from "../db/open.ts"
import { compare } from "../restore/compare.ts"
import { replay } from "../restore/replay.ts"
import { downloadToUddf } from "./convert.ts"
import { readUddf } from "../uddf/reader.ts"
import { writeUddf } from "../uddf/writer.ts"
import { addStops, stopsToAdd } from "./stops.ts"

// The D4i read whole, as the command reads it.
function download() {
  const folder = new URL(
    "../../../../fixtures/dctool/d4i/xml/",
    import.meta.url
  )
  const dives = readdirSync(folder)
    .sort()
    .map((name, i) => ({
      id: `dive-${i}`,
      xml: readFileSync(new URL(name, folder), "utf8"),
    }))
  return downloadToUddf(dives, "Suunto D4i")
}

// A log the D4i's Subsurface export was imported into, so its dives carry
// their fingerprints and no stops.
function importedLog() {
  const db = testDb()
  const preview = storePreview(db, d4iXml)
  applyImport(db, preview.id, {
    revision: preview.revision,
    pairs: [],
    add: preview.newDives.map((dive) => dive.ref),
    include: [],
  })
  return db
}

const dive = (db: Db, startTime: string) =>
  db
    .prepare(
      "SELECT id, mandatory_stop_events AS rows FROM dives WHERE start_time = ?"
    )
    .get(startTime) as { id: string; rows: number }
const stopsOf = (db: Db, id: string) =>
  db
    .prepare(
      "SELECT start_seconds AS start, end_seconds AS end FROM events WHERE dive_id = ? AND type = 'mandatory-stop' ORDER BY start_seconds"
    )
    .all(id)

describe("mandatory stops for dives already in the log", () => {
  it("gives each dive the watch matches the stops it holds", () => {
    const db = importedLog()
    const { found, twice } = stopsToAdd(db, download())
    expect(twice).toEqual([])
    const july = found.find((one) => one.startTime === "2026-07-20T11:59:25")
    expect(july?.stops).toEqual([
      { start: 1699, end: 3293 },
      { start: 3388, end: 3417 },
    ])
    // Only dives in the log; the watch's earlier owner's aren't.
    for (const { startTime } of found) expect(dive(db, startTime)).toBeDefined()

    expect(addStops(db, download()).found).toEqual(found)
    const { id, rows } = dive(db, "2026-07-20T11:59:25")
    expect(stopsOf(db, id)).toEqual(july!.stops)
    // Where each became mandatory and where it was cleared.
    expect(rows).toBe(4)
    // A second run finds nothing left to add.
    expect(stopsToAdd(db, download()).found).toEqual([])
  })

  it("comes back in a restore", () => {
    const db = importedLog()
    const snapshot = new Database(db.serialize())
    addStops(db, download())
    expect(replay(snapshot, db).failure).toBeUndefined()
    expect(compare(snapshot, db)).toEqual([])
  })

  it("survives the nightly export, ends between the samples included", () => {
    const db = importedLog()
    const { found } = addStops(db, download())
    const exported = new Map(
      readUddf(writeUddf(db).xml).map((dive) => [dive.startTime, dive])
    )
    for (const { startTime, stops } of found)
      expect(
        exported
          .get(startTime)!
          .events.filter((event) => event.type === "mandatory-stop")
      ).toEqual(stops.map((stop) => ({ type: "mandatory-stop", ...stop })))
  })

  it("leaves alone a log dive two downloaded dives match", () => {
    const db = importedLog()
    const once = download()
    const first = stopsToAdd(db, once).found[0]
    // That dive twice in one download, as two of its files might give it.
    const at = once.indexOf(`<datetime>${first.startTime}`)
    const start = once.lastIndexOf("<dive ", at)
    const end = once.indexOf("</dive>", at) + "</dive>".length
    const copy = once.slice(start, end).replace(/id="([^"]+)"/, 'id="$1-again"')
    const twiceOver = once.slice(0, end) + copy + once.slice(end)
    const { found, twice } = addStops(db, twiceOver)
    expect(twice.map((one) => one.diveId)).toEqual([first.diveId, first.diveId])
    expect(found.map((one) => one.diveId)).not.toContain(first.diveId)
    expect(stopsOf(db, first.diveId)).toEqual([])
  })
})
