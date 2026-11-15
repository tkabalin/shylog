import { placeKey } from "@shylog/core"
import { beforeEach, describe, expect, it } from "vitest"

import { send, testApp } from "../../../test/app.ts"
import { testDb } from "../../../test/db.ts"
import { diveId, seededDb } from "../../../test/fixture.ts"
import {
  callTool,
  diveOp,
  entityOp,
  mcpClient,
  upload,
} from "../../../test/mcp.ts"

type Client = Awaited<ReturnType<typeof mcpClient>>

// A small hand-logged log: four dives at three sites, with people, a trip,
// a tag, nitrox, an ignored dive and one in Recently deleted.
async function smallLog() {
  const db = testDb()
  const app = testApp({ db })
  const at = (
    id: string,
    startTime: string,
    siteId: string,
    fields: Record<string, unknown> = {}
  ) =>
    diveOp(id, { startTime, siteId, duration: 2700, maxDepth: 18, ...fields })
  await upload(
    app,
    entityOp("region", "region-false-bay", {
      name: "False Bay",
      countryCode: "ZA",
    }),
    entityOp("site", "site-long-beach", {
      name: "Long Beach",
      countryCode: "ZA",
      regionId: "region-false-bay",
    }),
    entityOp("person", "person-sam", { name: "Sam" }),
    at("dive-one", "2026-01-10T09:00:00", "site-long-beach", {
      buddies: ["person-sam"],
      tags: ["night"],
      notes: "A shyshark under the kelp",
    })
  )
  await upload(
    app,
    entityOp("site", "site-two-oceans", {
      name: "Two Oceans",
      countryCode: "ZA",
    }),
    entityOp("person", "person-ana", { name: "Ana" }),
    at("dive-two", "2026-02-11T10:00:00", "site-two-oceans", {
      duration: 1800,
      maxDepth: 12,
      diveProfessionals: ["person-ana"],
      nitrox: true,
      oxygen: 320,
    })
  )
  await upload(
    app,
    entityOp("site", "site-blue-hole", {
      name: "Blue Hole",
      countryCode: "EG",
    }),
    entityOp("trip", "trip-dahab", { name: "Dahab 2026" }),
    at("dive-three", "2026-03-12T11:00:00", "site-blue-hole", {
      duration: 3000,
      maxDepth: 30,
      tripId: "trip-dahab",
      buddies: ["person-ana"],
      ignored: true,
    })
  )
  await upload(
    app,
    at("dive-four", "2026-04-13T12:00:00", "site-long-beach", {
      duration: 2400,
      maxDepth: 20,
    })
  )
  await send(app, "DELETE", "/api/dives/dive-four")
  return { db, app, client: await mcpClient(app) }
}

const search = async (client: Client, args: Record<string, unknown> = {}) => {
  const reply = await callTool(client, "search_dives", args)
  const json = reply.json() as {
    showing: string
    totals: Record<string, number>
    dives: { id: string; number?: number }[]
  }
  return { ...json, ids: json.dives.map((dive) => dive.id) }
}

describe("search_dives", () => {
  let client: Client
  beforeEach(async () => {
    ;({ client } = await smallLog())
  })

  it("lists the live dives newest first, with totals that leave out ignored dives", async () => {
    const found = await search(client)
    expect(found.ids).toEqual(["dive-three", "dive-two", "dive-one"])
    expect(found.showing).toBe("1–3 of 3")
    expect(found.totals).toEqual({
      dives: 2,
      timeUnderwaterMin: 75,
      deepestM: 18,
      longestMin: 45,
    })
    expect(found.dives[2]).toEqual({
      number: 1,
      id: "dive-one",
      startTime: "2026-01-10T09:00:00",
      site: "Long Beach",
      durationMin: 45,
      maxDepthM: 18,
      gas: "air",
      buddies: ["Sam"],
      tags: ["night"],
    })
    expect(found.dives[0]).toMatchObject({ ignored: true })
    expect(found.dives[0]).not.toHaveProperty("number")
  })

  it.each([
    [{ from: "2026-02-01", to: "2026-03-12" }, ["dive-three", "dive-two"]],
    [{ numberFrom: 2, numberTo: 2 }, ["dive-two"]],
    [{ siteId: "site-long-beach" }, ["dive-one"]],
    [{ regionId: "region-false-bay" }, ["dive-one"]],
    [{ countryCode: "EG" }, ["dive-three"]],
    [{ tripId: "trip-dahab" }, ["dive-three"]],
    [{ personId: "person-ana" }, ["dive-three", "dive-two"]],
    [{ personId: "person-ana", personRole: "buddy" }, ["dive-three"]],
    [{ personId: "person-ana", personRole: "professional" }, ["dive-two"]],
    [{ tags: ["night", "wreck"] }, ["dive-one"]],
    [{ nitrox: true }, ["dive-two"]],
    [{ minDepthM: 13, maxDepthM: 18 }, ["dive-one"]],
    [{ minDurationMin: 45 }, ["dive-three", "dive-one"]],
    // Ignoring case and accents, over notes, sites and buddies.
    [{ text: "SHYSHÁRK" }, ["dive-one"]],
    [{ text: "two oceans" }, ["dive-two"]],
    [{ text: "sam" }, ["dive-one"]],
    [
      { includeDeleted: true, siteId: "site-long-beach" },
      ["dive-four", "dive-one"],
    ],
  ])("filters by %j", async (args, ids) => {
    expect((await search(client, args)).ids).toEqual(ids)
  })

  it("follows a merged-away id to the one kept", async () => {
    const { app, client: merged } = await smallLog()
    await send(app, "POST", "/api/entities/site/site-two-oceans/merge", {
      into: "site-long-beach",
    })
    expect((await search(merged, { siteId: "site-two-oceans" })).ids).toEqual([
      "dive-two",
      "dive-one",
    ])
  })

  it("sorts and pages", async () => {
    const deepest = await search(client, {
      sort: "deepest",
      limit: 1,
      offset: 1,
    })
    expect(deepest.ids).toEqual(["dive-one"])
    expect(deepest.showing).toBe("2–2 of 3")
    expect((await search(client, { sort: "oldest" })).ids[0]).toBe("dive-one")
  })
})

describe("get_dive", () => {
  let client: Client
  beforeEach(async () => {
    ;({ client } = await smallLog())
  })

  const get = async (args: Record<string, unknown>) =>
    (await callTool(client, "get_dive", args)).json()

  it("finds a dive by its number or its id", async () => {
    const byNumber = await get({ number: 2 })
    expect(byNumber).toEqual(await get({ id: "dive-two" }))
    expect(byNumber).toMatchObject({
      number: 2,
      id: "dive-two",
      site: { id: "site-two-oceans", name: "Two Oceans", water: "salt" },
      durationMin: 30,
      oxygenPercent: 32,
      professionals: [{ id: "person-ana", name: "Ana" }],
      sources: { durationMin: "hand", oxygenPercent: "hand" },
    })
  })

  it("names the site's region and the dive's people and trip", async () => {
    expect(await get({ number: 1 })).toMatchObject({
      site: { region: { id: "region-false-bay", name: "False Bay" } },
      buddies: [{ id: "person-sam", name: "Sam" }],
      tags: ["night"],
    })
    expect(await get({ id: "dive-three" })).toMatchObject({
      ignored: true,
      trip: { id: "trip-dahab", name: "Dahab 2026" },
    })
  })

  it("says how far the numbers go when one doesn't exist", async () => {
    const reply = await callTool(client, "get_dive", { number: 9 })
    expect(reply.isError).toBe(true)
    expect(reply.text).toBe("No dive is numbered 9: the log runs from 1 to 2")
  })

  it("wants either a number or an id", async () => {
    const reply = await callTool(client, "get_dive", { number: 1, id: "x" })
    expect(reply).toMatchObject({ isError: true })
  })

  it("flags a dive in Recently deleted, which has no number", async () => {
    expect(await get({ id: "dive-four" })).toMatchObject({ deleted: true })
    expect(await get({ id: "dive-four" })).not.toHaveProperty("number")
  })

  it("keeps a hand-logged dive free of computer figures", async () => {
    const dive = await get({ number: 1, includeProfile: true })
    for (const field of ["safetyStop", "ascentAlarms", "mandatoryStops"]) {
      expect(dive).not.toHaveProperty(field)
    }
    expect(dive.profile).toBeNull()
  })
})

describe("get_dive on a computer's dive", () => {
  it("gives the figures the dive's detail shows", async () => {
    // Fixture dive 63: EANx32 at 32.66 m in salt water (see Testing in the
    // spec), so max PO₂ 1.38 bar and MOD 33.2 m at 1.4.
    const db = seededDb()
    const client = await mcpClient(testApp({ db }))
    const dive = (
      await callTool(client, "get_dive", { id: diveId(db, 63) })
    ).json()
    expect(dive).toMatchObject({
      oxygenPercent: 32,
      maxDepthM: 32.66,
      figures: { maxPo2Bar: 1.38, modM: 33.2, maxPo2LimitBar: 1.4 },
      sources: { maxDepthM: "computer" },
      computerModel: expect.any(String),
    })
    expect(dive).toHaveProperty("ascentAlarms")
    expect(dive).toHaveProperty("mandatoryStops", 0)
  })

  it("keeps the computer's reading in app units beside a hand value", async () => {
    const db = seededDb()
    const app = testApp({ db })
    const id = diveId(db, 63)
    const patched = await send(app, "PATCH", `/api/dives/${id}`, {
      fields: { duration: 3000, nitrox: false },
    })
    expect(patched.ok).toBe(true)
    const client = await mcpClient(app)
    const dive = (await callTool(client, "get_dive", { id })).json()
    expect(dive.computerReadings).toEqual(
      expect.arrayContaining([
        { field: "durationMin", computerValue: expect.any(Number) },
        { field: "oxygenPercent", computerValue: 32 },
      ])
    )
    // The gas is one value: the diver's once Nitrox was typed over.
    expect(dive.sources).toMatchObject({
      durationMin: "hand",
      oxygenPercent: "hand",
    })
  })

  it("counts mandatory stops, not their rows, and lines up the profile", async () => {
    const db = seededDb()
    const id = diveId(db, 63)
    const insert = db.prepare(
      "INSERT INTO events (dive_id, type, start_seconds, end_seconds) VALUES (?, 'mandatory-stop', ?, ?)"
    )
    insert.run(id, 600, 900)
    insert.run(id, 1200, null)
    const client = await mcpClient(testApp({ db }))
    const dive = (
      await callTool(client, "get_dive", { id, includeProfile: true })
    ).json() as {
      durationMin: number
      mandatoryStops: number
      profile: { perMinute: { min: number }[]; events: { type: string }[] }
    }
    expect(dive.mandatoryStops).toBe(2)
    expect(dive.profile.perMinute[0].min).toBe(0)
    expect(dive.profile.perMinute.length).toBeGreaterThan(
      Math.floor(dive.durationMin) - 2
    )
    expect(dive.profile.events).toContainEqual({
      type: "mandatory-stop",
      atMin: 10,
      endMin: 15,
    })
  })
})

describe("list_entities", () => {
  it("lists one kind with its ids and counts, leaving out ignored and deleted dives", async () => {
    const { client } = await smallLog()
    const sites = (
      await callTool(client, "list_entities", { kind: "site" })
    ).json() as unknown as Record<string, unknown>[]
    expect(sites).toEqual([
      {
        id: "site-blue-hole",
        name: "Blue Hole",
        countryCode: "EG",
        water: "salt",
        dives: 0,
      },
      {
        id: "site-long-beach",
        name: "Long Beach",
        countryCode: "ZA",
        region: "False Bay",
        water: "salt",
        dives: 1,
        lastDive: "2026-01-10",
      },
      {
        id: "site-two-oceans",
        name: "Two Oceans",
        countryCode: "ZA",
        water: "salt",
        dives: 1,
        lastDive: "2026-02-11",
      },
    ])
  })

  it("narrows by a name it contains, ignoring case and accents", async () => {
    const { client } = await smallLog()
    const people = (
      await callTool(client, "list_entities", { kind: "person", name: "ÁN" })
    ).json()
    expect(people).toEqual([
      { id: "person-ana", name: "Ana", dives: 1, lastDive: "2026-02-11" },
    ])
  })

  it("lists the Unknown site only while a dive is on it", async () => {
    const { db, client } = await smallLog()
    db.prepare(
      "INSERT INTO sites (id, name, key, country_code, water_type) VALUES ('site-unknown', 'Unknown site', ?, 'ZA', 'salt')"
    ).run(placeKey("Unknown site", "ZA"))
    const names = async () =>
      (
        (
          await callTool(client, "list_entities", { kind: "site" })
        ).json() as unknown as { name: string }[]
      ).map((site) => site.name)
    expect(await names()).not.toContain("Unknown site")
    db.prepare(
      "UPDATE dives SET site_id = 'site-unknown' WHERE id = 'dive-four'"
    ).run()
    expect(await names()).toContain("Unknown site")
  })
})
