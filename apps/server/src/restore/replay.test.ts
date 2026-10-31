import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { opSchema, opVersion } from "@shylog/core"
import Database from "better-sqlite3"
import { describe, expect, it, onTestFinished } from "vitest"

import { apiHeaders, origin, send, testApp } from "../../test/app.ts"
import { diveId, seededDb } from "../../test/fixture.ts"
import { applyDraft } from "../apply/draft.ts"
import { initial } from "../db/migrations/001-initial.ts"
import { migrate, migrations } from "../db/migrate.ts"
import { openDatabase, type Db } from "../db/open.ts"
import { compare } from "./compare.ts"
import { replay } from "./replay.ts"

// An in-memory copy, as a nightly snapshot would hold.
function copyOf(db: Db) {
  const copy = new Database(db.serialize())
  copy.pragma("foreign_keys = ON")
  return copy
}

const png = (n: number) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n])

function liveApp() {
  const dir = mkdtempSync(join(tmpdir(), "shylog-replay-"))
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
  const db = seededDb()
  const app = testApp({ db, env: { SHYLOG_DATA_DIR: dir } })
  const putCard = (
    name: string,
    images: (Uint8Array<ArrayBuffer> | string)[]
  ) => {
    const form = new FormData()
    form.append("name", name)
    for (const image of images) {
      form.append(
        "images",
        typeof image === "string" ? image : new Blob([image])
      )
    }
    return app.request("/api/cards/card-padi", {
      method: "PUT",
      headers: { ...apiHeaders, Origin: origin },
      body: form,
    })
  }
  return { db, app, putCard }
}

const siteId = (db: Db, name: string) =>
  db
    .prepare("SELECT id FROM sites WHERE name = ?")
    .pluck()
    .get(name) as `site-${string}`

describe("replay", () => {
  it("rebuilds every kind of write the server journals", async () => {
    const { db, app, putCard } = liveApp()
    const snapshot = copyOf(db)
    const ok = async (res: Response | Promise<Response>) =>
      expect((await res).status).toBe(200)

    const sodwana = siteId(db, "Sodwana")
    const dive = diveId(db, 63)
    await ok(
      send(app, "PUT", "/api/entities/region/region-cape", {
        name: "Cape Town",
        countryCode: "ZA",
      })
    )
    await ok(
      send(app, "PUT", "/api/entities/site/site-long-beach", {
        name: "Long Beach",
        countryCode: "ZA",
        regionId: "region-cape",
      })
    )
    await ok(
      send(app, "PUT", "/api/entities/trip/trip-cape", { name: "Cape 2026" })
    )
    await ok(
      send(app, "PUT", "/api/entities/person/person-sam", {
        name: "Sam Naidoo",
      })
    )
    await ok(
      send(app, "PUT", "/api/entities/person/person-ayanda", { name: "Ayanda" })
    )
    await ok(
      send(app, "PUT", `/api/entities/site/${sodwana}`, {
        bodyOfWater: "oceanSea",
      })
    )
    await ok(
      send(app, "PATCH", `/api/dives/${dive}`, {
        fields: { tripId: "trip-cape", notes: "Turtles" },
      })
    )
    await ok(
      send(app, "POST", "/api/entities/person/person-ayanda/merge", {
        into: "person-sam",
      })
    )
    await ok(send(app, "DELETE", "/api/entities/trip/trip-cape"))
    await ok(send(app, "DELETE", `/api/dives/${dive}`))
    await ok(send(app, "POST", `/api/dives/${dive}/restore`))
    await ok(send(app, "DELETE", `/api/dives/${diveId(db, 61)}`))
    await ok(
      send(app, "PUT", "/api/settings", { diverName: "Thomas", maxPo2: 1.6 })
    )
    await ok(putCard("PADI Open Water", [png(1), png(2)]))
    const cards = (await (
      await app.request("/api/cards", { headers: apiHeaders })
    ).json()) as { images: string[] }[]
    const second = cards[0].images[1]
    await ok(putCard("PADI Open Water Diver", [second]))
    await ok(putCard("PADI Open Water Diver", [second, png(3)]))
    // A draft whose new site matches an existing one, so it is aliased.
    const draft = {
      opVersion,
      deviceId: "device-phone",
      at: new Date().toISOString(),
    }
    await ok(
      send(app, "POST", "/api/ops", {
        ops: [
          {
            ...draft,
            opId: "op-site",
            type: "upsertEntity",
            kind: "site",
            id: "site-long-beach-2",
            fields: { name: "long beach", countryCode: "ZA" },
          },
          {
            ...draft,
            opId: "op-dive",
            type: "upsertDive",
            diveId: "dive-late",
            fields: {
              startTime: "2026-10-19T09:00:00",
              siteId: "site-long-beach-2",
              duration: 2400,
              maxDepth: 12,
            },
          },
        ],
      })
    )

    const result = replay(snapshot, db)
    expect(result.failure).toBeUndefined()
    expect(result.notReplayed).toEqual([])
    expect(new Set(result.replayed.map((row) => row.type))).toEqual(
      new Set([
        "putEntity",
        "editDive",
        "mergeEntity",
        "deleteEntity",
        "deleteDive",
        "restoreDive",
        "putSettings",
        "putCard",
        "alias",
        "upsertEntity",
        "upsertDive",
      ])
    )
    // Including the dive's deleted_at, from the time first applied.
    expect(compare(snapshot, db)).toEqual([])
  })

  it("replays a card's removal", async () => {
    const { db, app, putCard } = liveApp()
    const snapshot = copyOf(db)
    expect((await putCard("PADI Open Water", [png(1)])).status).toBe(200)
    expect((await send(app, "DELETE", "/api/cards/card-padi")).status).toBe(200)
    expect(replay(snapshot, db).replayed.map((row) => row.type)).toEqual([
      "putCard",
      "deleteCard",
    ])
    expect(compare(snapshot, db)).toEqual([])
  })

  it("replays up to a sequence number and lists the rest", async () => {
    const { db, app } = liveApp()
    const snapshot = copyOf(db)
    await send(app, "PUT", "/api/settings", { diverName: "Thomas" })
    await send(app, "PUT", "/api/settings", { maxPo2: 1.6 })
    const [first, second] = db
      .prepare("SELECT seq FROM ops ORDER BY seq DESC LIMIT 2")
      .pluck()
      .all()
      .reverse() as number[]

    const result = replay(snapshot, db, first)
    expect(result.replayed.map((row) => row.seq)).toEqual([first])
    expect(result.notReplayed.map((row) => row.seq)).toEqual([second])
    expect(
      snapshot.prepare("SELECT diver_name, max_po2 FROM settings").get()
    ).toEqual({
      diver_name: "Thomas",
      max_po2: 1.4,
    })
  })

  it("replays a draft whole, never stopping inside it", async () => {
    const { db, app } = liveApp()
    const snapshot = copyOf(db)
    const draft = {
      opVersion,
      deviceId: "device-phone",
      at: new Date().toISOString(),
    }
    await send(app, "POST", "/api/ops", {
      ops: [
        {
          ...draft,
          opId: "op-site",
          type: "upsertEntity",
          kind: "site",
          id: "site-new",
          fields: { name: "New Reef", countryCode: "ZA" },
        },
        {
          ...draft,
          opId: "op-dive",
          type: "upsertDive",
          diveId: "dive-new",
          fields: {
            startTime: "2026-10-19T09:00:00",
            siteId: "site-new",
            duration: 2400,
            maxDepth: 12,
          },
        },
      ],
    })
    const [first, last] = db
      .prepare("SELECT seq FROM ops ORDER BY seq DESC LIMIT 2")
      .pluck()
      .all()
      .reverse() as number[]

    const partway = replay(copyOf(snapshot), db, first)
    expect(partway.replayed).toEqual([])
    expect(partway.notReplayed.map((row) => row.seq)).toEqual([first, last])
    expect(replay(snapshot, db).replayed).toHaveLength(2)
    expect(compare(snapshot, db)).toEqual([])
  })

  it("refuses entries written before a later migration", async () => {
    const live = openDatabase(":memory:")
    migrate(live, "/nonexistent", [initial])
    const old = copyOf(live)
    live.prepare("UPDATE settings SET diver_name = 'Thomas'").run()
    live
      .prepare(
        "INSERT INTO ops (type, payload, applied_at) VALUES ('putSettings', '{\"diverName\":\"Thomas\"}', '2026-10-21T10:00:00.000Z')"
      )
      .run()
    const dir = mkdtempSync(join(tmpdir(), "shylog-replay-"))
    onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
    migrate(live, dir)

    const result = replay(old, live)
    expect(result.replayed).toEqual([])
    expect(result.failure?.message).toMatch(
      `Written at schema 1, before this server's ${migrations.length}`
    )
    expect(result.notReplayed.map((row) => row.type)).toEqual([
      "putSettings",
      ...migrations.slice(1).map(() => "migration"),
    ])
  })

  it("ignores the two-year age rule", () => {
    const db = seededDb()
    const snapshot = copyOf(db)
    const at = "2023-01-01T10:00:00Z"
    // Applied when it was new, so the server's own check passed then.
    applyDraft(
      db,
      [
        opSchema.parse({
          opId: "op-old",
          opVersion,
          deviceId: "device-phone",
          at,
          type: "upsertDive",
          diveId: "dive-old",
          fields: {
            siteId: siteId(db, "Sodwana"),
            startTime: "2023-01-01T09:00:00",
            duration: 1800,
            maxDepth: 10,
          },
        }),
      ],
      new Date(at)
    )
    expect(replay(snapshot, db).failure).toBeUndefined()
    expect(compare(snapshot, db)).toEqual([])
  })

  it("runs migrations the journal records", () => {
    const live = openDatabase(":memory:")
    migrate(live, "/nonexistent", [initial])
    const old = copyOf(live)
    // The live database is no longer empty, so its migration snapshots.
    const dir = mkdtempSync(join(tmpdir(), "shylog-replay-"))
    onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
    migrate(live, dir)
    expect(replay(old, live).replayed.map((row) => row.type)).toEqual(
      migrations.slice(1).map(() => "migration")
    )
    expect(compare(old, live)).toEqual([])
  })

  it("stops at an entry that fails, keeping those before it", async () => {
    const { db, app } = liveApp()
    const snapshot = copyOf(db)
    await send(app, "PUT", "/api/settings", { diverName: "Thomas" })
    db.prepare(
      "INSERT INTO ops (type, payload, applied_at) VALUES ('seed', '{}', '2026-10-22T00:00:00Z')"
    ).run()
    await send(app, "PUT", "/api/settings", { maxPo2: 1.6 })

    const result = replay(snapshot, db)
    expect(result.replayed.map((row) => row.type)).toEqual(["putSettings"])
    expect(result.failure?.message).toBe("A seed entry can't be replayed")
    expect(result.notReplayed.map((row) => row.type)).toEqual([
      "seed",
      "putSettings",
    ])
  })

  it("refuses a snapshot from another database", async () => {
    const { db, app } = liveApp()
    await send(app, "PUT", "/api/settings", { diverName: "Thomas" })
    expect(() => replay(copyOf(db), seededDb())).toThrow(
      /not in the source database's journal/
    )
  })
})

describe("compare", () => {
  it("names the tables that differ and ignores the version", async () => {
    const { db, app } = liveApp()
    const copy = copyOf(db)
    db.prepare("UPDATE meta SET value = 'other' WHERE key = 'version'").run()
    expect(compare(copy, db)).toEqual([])
    await send(app, "PUT", "/api/settings", { diverName: "Thomas" })
    expect(compare(copy, db)).toEqual([
      `ops differs: ${migrations.length + 1} rows in the restored copy, ${migrations.length + 2} in the live database`,
      "settings differs: 1 rows in the restored copy, 1 in the live database",
      "sqlite_sequence differs: 1 rows in the restored copy, 1 in the live database",
    ])
  })

  it("stops at a schema difference, before any rows", () => {
    const { db } = liveApp()
    const copy = copyOf(db)
    db.exec("CREATE TABLE extra (x)")
    // Rows that differ too, which the schema line stands in for.
    db.prepare("INSERT INTO meta (key, value) VALUES ('extra', 'x')").run()
    expect(compare(copy, db)).toEqual([
      "schema: 0 objects only in the restored copy, 1 only in the live database",
    ])
  })
})
