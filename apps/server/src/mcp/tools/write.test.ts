import { placeKey } from "@shylog/core"
import { beforeEach, describe, expect, it } from "vitest"

import { send, testApp, testEnv, testWebRoot } from "../../../test/app.ts"
import { copyOf, testDb } from "../../../test/db.ts"
import { captureLog } from "../../../test/log.ts"
import { diveId, seededDb } from "../../../test/fixture.ts"
import {
  callTool,
  diveOp,
  entityOp,
  mcpClient,
  upload,
} from "../../../test/mcp.ts"
import { createApp } from "../../app.ts"
import type { Db } from "../../db/open.ts"
import { compare } from "../../restore/compare.ts"
import { replay } from "../../restore/replay.ts"

type Client = Awaited<ReturnType<typeof mcpClient>>

let db: Db
let app: ReturnType<typeof testApp>
let client: Client
beforeEach(async () => {
  db = testDb()
  app = testApp({ db })
  client = await mcpClient(app)
})

const row = (sql: string, ...args: unknown[]) =>
  db.prepare(sql).get(...args) as Record<string, unknown>
const journal = () =>
  db
    .prepare(
      "SELECT type, applied_at AS at FROM ops WHERE type != 'migration' ORDER BY seq"
    )
    .all() as {
    type: string
    at: string
  }[]

// A dive logged on the phone at Long Beach, with Sam as buddy.
async function phoneDive(fields: Record<string, unknown> = {}) {
  await upload(
    app,
    entityOp("site", "site-long-beach", {
      name: "Long Beach",
      countryCode: "ZA",
    }),
    entityOp("person", "person-sam", { name: "Sam" }),
    diveOp("dive-phone", {
      startTime: "2026-03-01T09:00:00",
      siteId: "site-long-beach",
      duration: 2700,
      maxDepth: 18,
      buddies: ["person-sam"],
      ...fields,
    })
  )
}

const longBeach = { new: { name: "Long Beach", countryCode: "ZA" } }
const logDive = (args: Record<string, unknown>) =>
  callTool(client, "log_dive", {
    startTime: "2026-03-02T10:00",
    site: longBeach,
    durationMin: 40,
    maxDepthM: 12,
    ...args,
  })

describe("log_dive", () => {
  it("logs a dive in database units, with the log's kit defaults and its new entities", async () => {
    await send(app, "PUT", "/api/settings", {
      newDiveDefaults: {
        cylinderMaterial: "steel",
        cylinderVolume: 12000,
        weight: 6,
      },
    })
    const reply = await logDive({
      startTime: "2026-03-01T09:30",
      site: {
        new: {
          name: "Long Beach",
          countryCode: "ZA",
          region: { new: { name: "False Bay" } },
        },
      },
      durationMin: 47,
      maxDepthM: 18.4,
      oxygenPercent: 32.4,
      buddies: [{ new: { name: "Sam" } }],
      weightKg: null,
    })
    expect(reply.isError).toBe(false)
    const { id, number, entities } = reply.json()
    expect(number).toBe(1)
    expect(
      (entities as { kind: string; outcome: string }[]).map(
        (entity) => `${entity.kind} ${entity.outcome}`
      )
    ).toEqual(["region created", "site created", "person created"])
    expect(
      row(
        "SELECT start_time, duration, max_depth, nitrox, oxygen, cylinder_material, cylinder_volume, weight FROM dives WHERE id = ?",
        id
      )
    ).toEqual({
      start_time: "2026-03-01T09:30:00",
      duration: 2820,
      max_depth: 18.4,
      nitrox: 1,
      oxygen: 324,
      cylinder_material: "steel",
      cylinder_volume: 12000,
      weight: null,
    })
    // Every value is the diver's, defaults included, as from the form.
    expect(
      db
        .prepare(
          "SELECT field FROM field_meta WHERE dive_id = ? AND source = 'hand' AND field LIKE 'cylinder%' ORDER BY field"
        )
        .pluck()
        .all(id)
    ).toEqual(["cylinderMaterial", "cylinderVolume"])
    // A phone draft's entries, so a restore's replay knows them.
    expect(journal().map((entry) => entry.type)).toEqual([
      "putSettings",
      "upsertEntity",
      "upsertEntity",
      "upsertEntity",
      "upsertDive",
    ])
  })

  it.each([
    ["air", 0],
    [20.9, 0],
    [21, 0],
    [32, 1],
  ])("takes oxygen %j as nitrox %i", async (oxygenPercent, nitrox) => {
    const { id } = (await logDive({ oxygenPercent })).json()
    expect(row("SELECT nitrox FROM dives WHERE id = ?", id)).toEqual({
      nitrox,
    })
  })

  // Between air and nitrox, or a slipped sign, which would otherwise save
  // as air without a word.
  it.each([21.05, 0, -32, 101])(
    "refuses oxygen %j, in per cent",
    async (oxygenPercent) => {
      const reply = await logDive({ oxygenPercent })
      expect(reply).toMatchObject({
        isError: true,
        text: 'oxygenPercent: Oxygen is from 21.1 to 100 % for nitrox, or "air" (20 to 21 %)',
      })
    }
  )

  it("refuses training details on a dive that isn't a training dive", async () => {
    const reply = await logDive({ trainingCourse: "Advanced" })
    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(
      /^trainingAgency: Training details go only on a training dive/
    )
    expect(
      (await logDive({ trainingCourse: "Advanced", diveType: "training" }))
        .isError
    ).toBe(false)
  })

  it("names the parameter a core rule refuses", async () => {
    const reply = await logDive({ maxDepthM: 400 })
    expect(reply).toMatchObject({
      isError: true,
      text: "maxDepthM: Up to 350 m",
    })
  })

  it("uses the site, person or trip that has the name already", async () => {
    await phoneDive()
    const reply = await logDive({
      site: { new: { name: "long  BEACH", countryCode: "ZA" } },
      buddies: [{ new: { name: "SAM" } }],
    })
    const { id, entities } = reply.json()
    expect(entities).toEqual([
      {
        kind: "site",
        id: "site-long-beach",
        name: "Long Beach",
        outcome: "matched",
      },
      { kind: "person", id: "person-sam", name: "Sam", outcome: "matched" },
    ])
    expect(row("SELECT site_id FROM dives WHERE id = ?", id)).toEqual({
      site_id: "site-long-beach",
    })
    expect(row("SELECT count(*) AS n FROM sites")).toEqual({ n: 1 })
  })

  it("doesn't make the new region of a site that already exists", async () => {
    await phoneDive()
    const reply = await logDive({
      site: {
        new: {
          name: "Long Beach",
          countryCode: "ZA",
          region: { new: { name: "Simon's Town" } },
        },
      },
    })
    expect(reply.json().entities).toEqual([
      {
        kind: "site",
        id: "site-long-beach",
        name: "Long Beach",
        outcome: "matched",
      },
    ])
    expect(row("SELECT count(*) AS n FROM regions")).toEqual({ n: 0 })
  })

  it("refuses a day that doesn't exist rather than reading it as another", async () => {
    await phoneDive({ startTime: "2026-03-02T09:00:00" })
    const reply = await logDive({ startTime: "2026-02-30T09:00" })
    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/^startTime: /)
    expect(reply.text).not.toMatch(/overlaps/)
  })

  it("refuses a dive that overlaps one already logged, naming it", async () => {
    await phoneDive()
    const reply = await logDive({ startTime: "2026-03-01T09:30" })
    expect(reply).toMatchObject({
      isError: true,
      text: "startTime: This overlaps dive 1 (Long Beach, 2026-03-01T09:00:00 for 45 min, id dive-phone). If it is the same dive, change that one with edit_dive.",
    })
    // Just after it ends is another dive.
    expect((await logDive({ startTime: "2026-03-01T09:45" })).isError).toBe(
      false
    )
  })

  // The refusal names the other dive's site for Claude, and logs never hold
  // what a diver wrote.
  it("logs an overlap without the other dive's site or time", async () => {
    await phoneDive()
    const lines = captureLog()
    await logDive({ startTime: "2026-03-01T09:30" })
    expect(lines.find((line) => line.event === "mcp_tool")).toMatchObject({
      outcome: "refused",
      reason: "This overlaps another dive",
    })
    expect(JSON.stringify(lines)).not.toContain("Long Beach")
  })

  // A stripped parameter would log the dive without it and report success.
  it("refuses a parameter it doesn't know rather than dropping it", async () => {
    const reply = await logDive({ buddy: [{ new: { name: "Sam" } }] })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("buddy")
    expect(row("SELECT count(*) AS n FROM dives")).toEqual({ n: 0 })
  })

  it("counts an ignored dive and a dive crossing midnight, not a deleted one", async () => {
    await phoneDive({ startTime: "2026-03-01T23:40:00", ignored: true })
    const after = await logDive({ startTime: "2026-03-02T00:10" })
    expect(after.text).toMatch(
      /^startTime: This overlaps an ignored dive on 2026-03-01/
    )
    await send(app, "DELETE", "/api/dives/dive-phone")
    expect((await logDive({ startTime: "2026-03-02T00:10" })).isError).toBe(
      false
    )
  })

  it("says when a dive logged earlier moves later numbers up", async () => {
    await phoneDive()
    const reply = (await logDive({ startTime: "2026-02-01T09:00" })).json()
    expect(reply).toMatchObject({
      number: 1,
      note: "Logged before 1 later dive, whose numbers each moved up by one.",
    })
  })

  it("never puts a dive on the Unknown site an import keeps", async () => {
    db.prepare(
      "INSERT INTO sites (id, name, key, country_code, water_type) VALUES ('site-unknown', 'Unknown site', ?, 'ZA', 'salt')"
    ).run(placeKey("Unknown site", "ZA"))
    for (const site of [
      { id: "site-unknown" },
      { new: { name: "unknown site", countryCode: "ZA" } },
    ]) {
      const reply = await logDive({ site })
      expect(reply.isError).toBe(true)
      expect(reply.text).toMatch(/^site: Unknown site only holds imported/)
    }
  })

  it("writes nothing while the database has failed its check", async () => {
    const paused = createApp({
      db,
      env: testEnv(),
      dbFile: null,
      webRoot: testWebRoot(),
      state: { integrity: "failed" },
    })
    const reply = await callTool(await mcpClient(paused), "log_dive", {
      startTime: "2026-03-02T10:00",
      site: longBeach,
      durationMin: 40,
      maxDepthM: 12,
    })
    expect(reply).toMatchObject({
      isError: true,
      text: "Saving is paused: the database failed its check",
    })
    expect(row("SELECT count(*) AS n FROM dives")).toEqual({ n: 0 })
  })
})

describe("edit_dive", () => {
  beforeEach(() => phoneDive({ visibilityRating: "high", notes: "Kelp" }))

  const edit = (args: Record<string, unknown>) =>
    callTool(client, "edit_dive", { id: "dive-phone", ...args })

  it("sets and clears fields and says what changed", async () => {
    const reply = await edit({ maxDepthM: 20, notes: null })
    expect(reply.json()).toEqual({
      id: "dive-phone",
      changes: {
        maxDepthM: { before: 18, after: 20 },
        notes: { before: "Kelp", after: null },
      },
      entities: [],
    })
    const entries = journal().length
    expect((await edit({ maxDepthM: 20 })).text).toBe("No change")
    expect(journal()).toHaveLength(entries)
  })

  it("reports a flag turned off as false", async () => {
    await edit({ ignored: true })
    expect((await edit({ ignored: false })).json()).toMatchObject({
      changes: { ignored: { before: true, after: false } },
    })
  })

  it("clears the visibility rating when the visibility is set in metres", async () => {
    await edit({ visibilityM: 12 })
    expect(
      row(
        "SELECT visibility, visibility_rating FROM dives WHERE id = 'dive-phone'"
      )
    ).toEqual({ visibility: 12, visibility_rating: null })
  })

  it("makes a new buddy and edits the dive in one transaction", async () => {
    const reply = (
      await edit({
        buddies: [{ id: "person-sam" }, { new: { name: "Ana" } }],
      })
    ).json() as { changes: { buddies: { after: { name: string }[] } } }
    expect(reply.changes.buddies.after.map((buddy) => buddy.name)).toEqual([
      "Sam",
      "Ana",
    ])
    const [put, edited] = journal().slice(-2)
    expect([put.type, edited.type]).toEqual(["putEntity", "editDive"])
    expect(put.at).toBe(edited.at)
  })

  it("refuses training details on a dive that stays recreational", async () => {
    const reply = await edit({ trainingAgency: "PADI" })
    expect(reply.isError).toBe(true)
  })

  it("names the parameter, in the tool's units, when a value is out of range", async () => {
    expect(await edit({ durationMin: 2000 })).toMatchObject({
      isError: true,
      text: "durationMin: Up to 24 h",
    })
  })

  it("refuses a time that overlaps another dive", async () => {
    await upload(
      app,
      diveOp("dive-later", {
        startTime: "2026-03-01T11:00:00",
        siteId: "site-long-beach",
        duration: 1800,
        maxDepth: 12,
      })
    )
    const reply = await edit({ startTime: "2026-03-01T10:45" })
    expect(reply.text).toMatch(/^startTime: This overlaps dive 2 /)
    // Its own time doesn't count.
    expect((await edit({ durationMin: 50 })).isError).toBe(false)
  })

  it("refuses a day that doesn't exist rather than reading it as another", async () => {
    await upload(
      app,
      diveOp("dive-march", {
        startTime: "2026-03-02T09:00:00",
        siteId: "site-long-beach",
        duration: 1800,
        maxDepth: 12,
      })
    )
    const reply = await edit({ startTime: "2026-02-30T09:00" })
    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/^startTime: /)
    expect(reply.text).not.toMatch(/overlaps/)
  })

  it("edits a dive already overlapping another when its time is sent back", async () => {
    // Drafts from the phone aren't checked for overlaps.
    await upload(
      app,
      diveOp("dive-overlap", {
        startTime: "2026-03-01T09:30:00",
        siteId: "site-long-beach",
        duration: 1800,
        maxDepth: 12,
      })
    )
    const reply = await edit({
      startTime: "2026-03-01T09:00",
      durationMin: 45,
      maxDepthM: 19,
    })
    expect(reply.json()).toMatchObject({
      changes: { maxDepthM: { before: 18, after: 19 } },
    })
  })

  it("says when moving a dive renumbered others", async () => {
    await upload(
      app,
      diveOp("dive-earlier", {
        startTime: "2026-02-01T09:00:00",
        siteId: "site-long-beach",
        duration: 1800,
        maxDepth: 12,
      })
    )
    const reply = (await edit({ startTime: "2026-01-01T09:00" })).json()
    expect(reply).toMatchObject({
      changes: { number: { before: 2, after: 1 } },
      note: "1 other dive was renumbered.",
    })
  })

  it("leaves the calculated surface interval alone when it is sent back", async () => {
    await upload(
      app,
      diveOp("dive-second", {
        startTime: "2026-03-01T11:00:00",
        siteId: "site-long-beach",
        duration: 1800,
        maxDepth: 12,
      })
    )
    const shown = (
      await callTool(client, "get_dive", { id: "dive-second" })
    ).json().surfaceIntervalMin
    expect(shown).toBe(75)
    const reply = await callTool(client, "edit_dive", {
      id: "dive-second",
      surfaceIntervalMin: shown,
    })
    expect(reply.text).toBe("No change")
    expect(
      row(
        "SELECT surface_interval_override AS o FROM dives WHERE id = 'dive-second'"
      )
    ).toEqual({ o: 0 })
  })

  it("refuses a dive that doesn't exist", async () => {
    const reply = await callTool(client, "edit_dive", {
      id: "dive-nope",
      maxDepthM: 3,
    })
    expect(reply).toMatchObject({ isError: true, text: "No dive has that id" })
  })
})

describe("edit_dive on a computer's dive", () => {
  beforeEach(async () => {
    db = seededDb()
    app = testApp({ db })
    client = await mcpClient(app)
  })

  // Recorded as the diver's, it would stop following the samples and a
  // later import would keep it over the computer's.
  it("leaves an average depth the samples gave alone when it is sent back", async () => {
    const id = diveId(db, 63)
    const meta = () =>
      db
        .prepare(
          "SELECT source FROM field_meta WHERE dive_id = ? AND field = 'averageDepth'"
        )
        .get(id)
    // As for a computer that gives samples but no average of its own; the
    // first edit has the derived pass work it out.
    db.prepare(
      "DELETE FROM field_meta WHERE dive_id = ? AND field = 'averageDepth'"
    ).run(id)
    await callTool(client, "edit_dive", { id, notes: "Kelp" })
    const shown = (await callTool(client, "get_dive", { id })).json()
      .averageDepthM
    expect(shown).toBeTypeOf("number")
    const reply = await callTool(client, "edit_dive", {
      id,
      averageDepthM: shown,
      notes: "Seals",
    })
    expect(Object.keys(reply.json().changes as object)).toEqual(["notes"])
    expect(meta()).toBeUndefined()
  })

  it("refuses to adopt a computer's time that overlaps another dive", async () => {
    const id = diveId(db, 63)
    const start = () =>
      row("SELECT start_time FROM dives WHERE id = ?", id).start_time as string
    const computer = start()
    await callTool(client, "edit_dive", { id, startTime: "2001-01-01T10:00" })
    const other = await logDive({ startTime: computer.slice(0, 16) })
    expect(other.isError).toBe(false)
    const reply = await callTool(client, "edit_dive", {
      id,
      adopt: ["startTime"],
    })
    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/^startTime: This overlaps dive /)
    expect(start()).toBe("2001-01-01T10:00:00")
  })

  // Shown to 0.01 min, which converts back to the same second, so the
  // computer's value isn't turned into a slightly different hand one.
  it("changes nothing when the duration it showed is sent back", async () => {
    const id = diveId(db, 63)
    const shown = (await callTool(client, "get_dive", { id })).json()
      .durationMin
    const reply = await callTool(client, "edit_dive", {
      id,
      durationMin: shown,
    })
    expect(reply.text).toBe("No change")
    expect(
      row(
        "SELECT source FROM field_meta WHERE dive_id = ? AND field = 'duration'",
        id
      )
    ).toEqual({ source: "computer" })
  })

  it("keeps the computer's reading beside a hand value, and adopts it back", async () => {
    const id = diveId(db, 63)
    const computer = row("SELECT max_depth FROM dives WHERE id = ?", id)
      .max_depth as number
    await callTool(client, "edit_dive", { id, maxDepthM: 30 })
    expect(
      row(
        "SELECT source, computer_value FROM field_meta WHERE dive_id = ? AND field = 'maxDepth'",
        id
      )
    ).toEqual({ source: "hand", computer_value: computer })
    const adopted = (
      await callTool(client, "edit_dive", { id, adopt: ["maxDepthM"] })
    ).json() as { changes: Record<string, { after: unknown }> }
    expect(adopted.changes.maxDepthM.after).toBe(computer)
    expect(
      row(
        "SELECT source FROM field_meta WHERE dive_id = ? AND field = 'maxDepth'",
        id
      )
    ).toEqual({ source: "computer" })
  })
})

describe("edit_entity", () => {
  beforeEach(async () => {
    await phoneDive()
    await upload(
      app,
      entityOp("site", "site-two-oceans", {
        name: "Two Oceans",
        countryCode: "ZA",
      }),
      diveOp("dive-two", {
        startTime: "2026-03-03T09:00:00",
        siteId: "site-two-oceans",
        duration: 1800,
        maxDepth: 12,
      })
    )
  })

  it("renames an existing one", async () => {
    const reply = await callTool(client, "edit_entity", {
      kind: "site",
      id: "site-long-beach",
      name: "Long Beach, Simon's Town",
    })
    expect(reply.json()).toEqual({
      id: "site-long-beach",
      name: "Long Beach, Simon's Town",
    })
  })

  it("refuses a name another has, naming it for a merge", async () => {
    const reply = await callTool(client, "edit_entity", {
      kind: "site",
      id: "site-long-beach",
      name: "two oceans",
    })
    expect(reply).toMatchObject({
      isError: true,
      text: "name: There is already a site called Two Oceans. The existing one is Two Oceans, id site-two-oceans.",
    })
  })

  it("says when a region's sites moved with its country", async () => {
    await send(app, "PUT", "/api/entities/region/region-bay", {
      name: "The Bay",
      countryCode: "ZA",
    })
    await send(app, "PUT", "/api/entities/site/site-two-oceans", {
      regionId: "region-bay",
    })
    const reply = await callTool(client, "edit_entity", {
      kind: "region",
      id: "region-bay",
      countryCode: "NA",
    })
    expect(reply.json()).toEqual({
      id: "region-bay",
      name: "The Bay",
      note: "Its 1 site moved to the new country too.",
    })
  })

  it("never makes one under an id it doesn't know", async () => {
    const reply = await callTool(client, "edit_entity", {
      kind: "trip",
      id: "trip-new",
      name: "Dahab",
    })
    expect(reply).toMatchObject({ isError: true, text: "No such trip" })
    expect(row("SELECT count(*) AS n FROM trips")).toEqual({ n: 0 })
  })
})

describe("merge_entities", () => {
  it("moves the dives onto the one kept, once", async () => {
    await phoneDive()
    await upload(
      app,
      entityOp("person", "person-samuel", { name: "Samuel" }),
      diveOp("dive-two", {
        startTime: "2026-03-03T09:00:00",
        siteId: "site-long-beach",
        duration: 1800,
        maxDepth: 12,
        buddies: ["person-samuel"],
      })
    )
    const merge = () =>
      callTool(client, "merge_entities", {
        kind: "person",
        id: "person-samuel",
        into: "person-sam",
      })
    expect((await merge()).json()).toEqual({
      into: { id: "person-sam", name: "Sam" },
    })
    expect(
      row("SELECT person_id FROM dive_buddies WHERE dive_id = 'dive-two'")
    ).toEqual({ person_id: "person-sam" })
    expect((await merge()).text).toBe("Already merged")
  })

  it("names the one kept when merging into one merged away", async () => {
    await phoneDive()
    await send(app, "PUT", "/api/entities/person/person-ana", { name: "Ana" })
    await send(app, "PUT", "/api/entities/person/person-anna", {
      name: "Anna",
    })
    await send(app, "POST", "/api/entities/person/person-anna/merge", {
      into: "person-ana",
    })
    const reply = await callTool(client, "merge_entities", {
      kind: "person",
      id: "person-sam",
      into: "person-anna",
    })
    expect(reply.json()).toEqual({ into: { id: "person-ana", name: "Ana" } })
  })
})

describe("assign_dives", () => {
  beforeEach(async () => {
    await phoneDive()
    await upload(
      app,
      diveOp("dive-two", {
        startTime: "2026-03-03T09:00:00",
        siteId: "site-long-beach",
        duration: 1800,
        maxDepth: 12,
      })
    )
  })

  it("makes a new trip with its dives in one entry, as You's batch does", async () => {
    const reply = (
      await callTool(client, "assign_dives", {
        kind: "trip",
        target: { new: { name: "False Bay weekend" } },
        add: ["dive-phone", "dive-two"],
      })
    ).json() as { trip: { id: string; name: string }; dives: number }
    expect(reply).toMatchObject({
      trip: { name: "False Bay weekend" },
      dives: 2,
    })
    const [last] = db
      .prepare("SELECT type, payload FROM ops ORDER BY seq DESC LIMIT 1")
      .all() as { type: string; payload: string }[]
    expect(last.type).toBe("setEntityDives")
    expect(JSON.parse(last.payload)).toMatchObject({
      create: { name: "False Bay weekend" },
    })
  })

  it("reports the trip a merged-away one's dives land on", async () => {
    await send(app, "PUT", "/api/entities/trip/trip-old", { name: "Old" })
    await send(app, "PUT", "/api/entities/trip/trip-new", { name: "New" })
    await send(app, "POST", "/api/entities/trip/trip-old/merge", {
      into: "trip-new",
    })
    const reply = await callTool(client, "assign_dives", {
      kind: "trip",
      target: { id: "trip-old" },
      add: ["dive-phone"],
    })
    expect(reply.json()).toMatchObject({
      trip: { id: "trip-new", name: "New" },
      dives: 1,
    })
  })

  it("asks a person's role rather than assuming buddy", async () => {
    const reply = await callTool(client, "assign_dives", {
      kind: "person",
      target: { id: "person-sam" },
      add: ["dive-two"],
    })
    expect(reply).toMatchObject({
      isError: true,
      text: "role: Say whether they were a buddy or a dive professional on these dives",
    })
  })

  it("adds a person in a role without dropping the dive's others", async () => {
    await callTool(client, "assign_dives", {
      kind: "person",
      target: { new: { name: "Ana" } },
      add: ["dive-phone"],
      role: "professional",
    })
    const dive = (
      await callTool(client, "get_dive", { id: "dive-phone" })
    ).json()
    expect(dive).toMatchObject({
      buddies: [{ name: "Sam" }],
      professionals: [{ name: "Ana" }],
    })
  })

  it("takes dives off and keeps the trip when its last dive goes", async () => {
    const { trip } = (
      await callTool(client, "assign_dives", {
        kind: "trip",
        target: { new: { name: "Weekend" } },
        add: ["dive-phone"],
      })
    ).json() as { trip: { id: string } }
    const reply = await callTool(client, "assign_dives", {
      kind: "trip",
      target: { id: trip.id },
      remove: ["dive-phone"],
    })
    expect(reply.json()).toMatchObject({ dives: 0 })
    expect(row("SELECT count(*) AS n FROM trips")).toEqual({ n: 1 })
  })

  it("says when the dives were on it already", async () => {
    const assign = () =>
      callTool(client, "assign_dives", {
        kind: "trip",
        target: { new: { name: "Weekend" } },
        add: ["dive-phone"],
      })
    await assign()
    expect((await assign()).text).toBe("No change")
  })

  it("won't make a trip, centre or person without a dive", async () => {
    const reply = await callTool(client, "assign_dives", {
      kind: "trip",
      target: { new: { name: "Empty" } },
    })
    expect(reply).toMatchObject({
      isError: true,
      text: "A new one needs at least one dive",
    })
    expect(row("SELECT count(*) AS n FROM trips")).toEqual({ n: 0 })
  })
})

// The journal a restore replays reproduces what the tools wrote.
it("replays every tool's writes to the same database", async () => {
  db = seededDb()
  app = testApp({ db })
  client = await mcpClient(app)
  const snapshot = copyOf(db)
  const { id } = (await logDive({ buddies: [{ new: { name: "Sam" } }] })).json()
  await callTool(client, "edit_dive", {
    id,
    maxDepthM: 14,
    trip: { new: { name: "Sodwana 2026" } },
  })
  await callTool(client, "edit_dive", {
    id: diveId(db, 63),
    maxDepthM: 30,
    buddies: [{ new: { name: "Samantha" } }],
  })
  const people = db
    .prepare("SELECT id FROM people ORDER BY name")
    .pluck()
    .all() as string[]
  await callTool(client, "merge_entities", {
    kind: "person",
    id: people[1],
    into: people[0],
  })
  await callTool(client, "assign_dives", {
    kind: "diveCentre",
    target: { new: { name: "Dive Team" } },
    add: [id, diveId(db, 61)],
  })
  const site = row("SELECT site_id FROM dives WHERE id = ?", id)
    .site_id as string
  await callTool(client, "edit_entity", {
    kind: "site",
    id: site,
    bodyOfWater: "ocean",
  })
  expect(replay(snapshot, db).failure).toBeUndefined()
  expect(compare(snapshot, db)).toEqual([])
})
