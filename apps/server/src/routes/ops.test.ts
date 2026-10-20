import { placeKey } from "@shylog/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { apiHeaders, send, testApp } from "../../test/app.ts"
import { testDb } from "../../test/db.ts"
import type { Db } from "../db/open.ts"
import type { Log } from "./log.ts"

// Version 2, so the previous version (1) is one core's schema accepts.
vi.mock("@shylog/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shylog/core")>()),
  opVersion: 2,
}))

let db: Db
let app: ReturnType<typeof testApp>
beforeEach(() => {
  db = testDb()
  app = testApp({ db })
})

let opCount = 0
const base = () => ({
  opId: `op-${++opCount}`,
  opVersion: 2,
  deviceId: "device-phone",
  at: new Date().toISOString(),
})

const site = (id: string, fields: Record<string, unknown> = {}) => ({
  ...base(),
  type: "upsertEntity",
  kind: "site",
  id,
  fields: { name: "Two Mile Reef", countryCode: "ZA", ...fields },
})

const person = (id: string, name = "Ayanda Dlamini") => ({
  ...base(),
  type: "upsertEntity",
  kind: "person",
  id,
  fields: { name },
})

const dive = (diveId: string, fields: Record<string, unknown> = {}) => ({
  ...base(),
  type: "upsertDive",
  diveId,
  fields: {
    startTime: "2026-07-22T08:41:00",
    siteId: "site-two-mile",
    duration: 2520,
    maxDepth: 18.4,
    ...fields,
  },
})

const upload = (ops: unknown[]) => send(app, "POST", "/api/ops", { ops })

const getLog = async () =>
  (await (await app.request("/api/log", { headers: apiHeaders })).json()) as Log

const journal = () =>
  db
    .prepare(
      "SELECT op_id AS opId, type FROM ops WHERE type <> 'migration' ORDER BY seq"
    )
    .all() as {
    opId: string | null
    type: string
  }[]

const insertSite = (id: string, name: string) =>
  db
    .prepare(
      "INSERT INTO sites (id, name, key, country_code, water_type) VALUES (?, ?, ?, 'ZA', 'salt')"
    )
    .run(id, name, placeKey(name, "ZA"))

describe("POST /api/ops", () => {
  it("creates the draft's dive and entities, journalling each op", async () => {
    const before = await getLog()
    const ops = [
      dive("dive-a", {
        buddies: ["person-ayanda"],
        notes: "Ragged-tooth sharks",
      }),
      site("site-two-mile"),
      person("person-ayanda"),
    ]
    const res = await upload(ops)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { result: string; version: string }
    expect(body.result).toBe("applied")
    expect(body.version).not.toBe(before.version)

    expect(journal()).toEqual([
      { opId: ops[1].opId, type: "upsertEntity" },
      { opId: ops[2].opId, type: "upsertEntity" },
      { opId: ops[0].opId, type: "upsertDive" },
    ])
    const log = await getLog()
    expect(log.version).toBe(body.version)
    expect(log.dives).toMatchObject([
      {
        id: "dive-a",
        number: 1,
        siteId: "site-two-mile",
        notes: "Ragged-tooth sharks",
      },
    ])
    expect(log.sites.map((s) => s.name)).toEqual(["Two Mile Reef"])
    expect(log.links).toEqual([
      { diveId: "dive-a", type: "buddy", target: "person-ayanda", position: 0 },
    ])
  })

  it("records every filled-in field as a hand value", async () => {
    const res = await upload([
      site("site-two-mile"),
      person("person-ayanda"),
      dive("dive-a", {
        buddies: ["person-ayanda"],
        nitrox: true,
        oxygen: 320,
        tags: ["drift"],
        notes: "  ",
      }),
    ])
    expect(await res.json()).toMatchObject({ result: "applied" })
    const meta = (await getLog()).fieldMeta
    expect(meta.every((row) => row.source === "hand")).toBe(true)
    // The empty notes box was not filled in.
    expect(meta.map((row) => row.field).sort()).toEqual([
      "buddies",
      "diveType",
      "duration",
      "ignored",
      "maxDepth",
      "nitrox",
      "oxygen",
      "siteId",
      "startTime",
      "tags",
    ])
  })

  it("replies 'already applied' to a resent draft and changes nothing", async () => {
    const ops = [site("site-two-mile"), dive("dive-a")]
    const first = (await (await upload(ops)).json()) as { version: string }
    const res = await upload(ops)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      result: "alreadyApplied",
      version: first.version,
    })
    expect(journal()).toHaveLength(2)
    expect((await getLog()).dives).toHaveLength(1)
  })

  it("makes a site matching an existing one's key an alias of it", async () => {
    insertSite("site-existing", "Two Mile Reef")
    const res = await upload([
      site("site-two-mile", { name: "two  mile reef " }),
      dive("dive-a"),
    ])
    expect(res.status).toBe(200)
    expect(
      db.prepare("SELECT id, kind, target_id AS target FROM aliases").all()
    ).toEqual([{ id: "site-two-mile", kind: "site", target: "site-existing" }])
    expect(journal().map((entry) => entry.type)).toEqual([
      "alias",
      "upsertEntity",
      "upsertDive",
    ])
    const log = await getLog()
    expect(log.sites.map((s) => s.id)).toEqual(["site-existing"])
    expect(log.dives[0].siteId).toBe("site-existing")
  })

  it("follows a chain of aliases to the survivor of merges", async () => {
    insertSite("site-survivor", "Two Mile Reef")
    db.prepare(
      "INSERT INTO aliases (id, kind, target_id) VALUES ('site-first', 'site', 'site-second'), ('site-second', 'site', 'site-survivor')"
    ).run()
    expect(
      (await upload([dive("dive-a", { siteId: "site-first" })])).status
    ).toBe(200)
    expect((await getLog()).dives[0].siteId).toBe("site-survivor")
  })

  it("uses an entity the server already has as it is", async () => {
    insertSite("site-two-mile", "Two Mile Reef")
    await upload([
      site("site-two-mile", { name: "Renamed offline" }),
      dive("dive-a"),
    ])
    expect((await getLog()).sites.map((s) => s.name)).toEqual(["Two Mile Reef"])
  })

  it("rejects a draft pointing at a deleted entity whole", async () => {
    insertSite("site-two-mile", "Two Mile Reef")
    db.prepare(
      "INSERT INTO people (id, name, key) VALUES ('person-gone', 'Gone', 'gone')"
    ).run()
    db.prepare("DELETE FROM people WHERE id = 'person-gone'").run()
    const res = await upload([
      person("person-ayanda"),
      dive("dive-a", { buddies: ["person-ayanda", "person-gone"] }),
    ])
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      error: "A person on this dive was deleted",
      path: ["fields", "buddies", 1],
    })
    const log = await getLog()
    expect(log.dives).toEqual([])
    expect(log.people).toEqual([])
    expect(journal()).toEqual([])
  })

  it("rejects a re-sent draft whose new entity was deleted since", async () => {
    await upload([site("site-two-mile"), person("person-x"), dive("dive-a")])
    await send(app, "DELETE", "/api/entities/person/person-x")
    const res = await upload([
      person("person-x"),
      dive("dive-a", { buddies: ["person-x"] }),
    ])
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({
      error: "A person on this dive was deleted",
    })
    expect((await getLog()).people).toEqual([])
  })

  it("rejects an alias whose survivor was deleted, even if its name matches another", async () => {
    db.prepare(
      "INSERT INTO people (id, name, key) VALUES ('person-c', 'Ayanda Dlamini', 'ayanda dlamini')"
    ).run()
    db.prepare(
      "INSERT INTO aliases (id, kind, target_id) VALUES ('person-a', 'person', 'person-gone')"
    ).run()
    insertSite("site-two-mile", "Two Mile Reef")
    const res = await upload([
      person("person-a"),
      dive("dive-a", { buddies: ["person-a"] }),
    ])
    expect(res.status).toBe(422)
  })

  it("accepts the current and previous op versions only", async () => {
    const tooNew = upload([
      { ...site("site-two-mile"), opVersion: 3 },
      dive("dive-a"),
    ])
    expect((await tooNew).status).toBe(422)
    const previous = await upload([
      { ...site("site-two-mile"), opVersion: 1 },
      { ...dive("dive-a"), opVersion: 1 },
    ])
    expect(previous.status).toBe(200)
  })

  it("rejects an op more than two years old", async () => {
    const old = new Date()
    old.setUTCFullYear(old.getUTCFullYear() - 2)
    old.setUTCDate(old.getUTCDate() - 1)
    const res = await upload([
      site("site-two-mile"),
      { ...dive("dive-a"), at: old.toISOString() },
    ])
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({
      error: "This draft is more than two years old",
    })
  })

  it("rolls back a failing draft and records no op ids, so it can be resent fixed", async () => {
    db.prepare(
      "INSERT INTO regions (id, name, key, country_code) VALUES ('region-hoi-an', 'Hoi An', 'VN:hoi an', 'VN')"
    ).run()
    const ops = [
      person("person-ayanda"),
      site("site-two-mile", { regionId: "region-hoi-an" }),
      dive("dive-a", { buddies: ["person-ayanda"] }),
    ]
    const res = await upload(ops)
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({
      error: "The region is in another country",
    })
    expect((await getLog()).people).toEqual([])
    expect(journal()).toEqual([])

    const fixed = {
      ...ops[1],
      fields: {
        name: "Two Mile Reef",
        countryCode: "VN",
        regionId: "region-hoi-an",
      },
    }
    const again = await upload([ops[0], fixed, ops[2]])
    expect(again.status).toBe(200)
    expect(await again.json()).toMatchObject({ result: "applied" })
  })

  it("rejects a malformed draft", async () => {
    const res = await upload([dive("dive-a", { maxDepth: -1 })])
    expect(res.status).toBe(400)
  })

  describe("for a dive the server already has", () => {
    beforeEach(async () => {
      await upload([
        site("site-two-mile"),
        dive("dive-a", { notes: "First", weight: 4 }),
      ])
    })

    it("applies new op ids as an edit, keeping what the draft leaves out", async () => {
      const res = await upload([dive("dive-a", { notes: "Edited offline" })])
      expect(res.status).toBe(200)
      expect((await getLog()).dives[0]).toMatchObject({
        notes: "Edited offline",
        weight: 4,
      })
    })

    it("rejects it once the dive is in Recently deleted", async () => {
      db.prepare("UPDATE dives SET deleted_at = '2026-10-20T10:00:00Z'").run()
      const res = await upload([dive("dive-a", { notes: "Edited offline" })])
      expect(res.status).toBe(422)
      expect((await getLog()).dives[0].notes).toBe("First")
    })
  })
})
