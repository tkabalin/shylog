import { opVersion } from "@shylog/core"
import { beforeEach, describe, expect, it } from "vitest"

import { apiHeaders, send, testApp } from "../../test/app.ts"
import { diveId, seededDb } from "../../test/fixture.ts"
import type { Db } from "../db/open.ts"
import type { Log } from "./log.ts"

let db: Db
let app: ReturnType<typeof testApp>
let sodwana: string
let unnamed: string
beforeEach(() => {
  db = seededDb()
  app = testApp({ db })
  const site = (name: string) =>
    db
      .prepare("SELECT id FROM sites WHERE name = ?")
      .pluck()
      .get(name) as string
  sodwana = site("Sodwana")
  unnamed = site("Unnamed site")
})

const put = (kind: string, id: string, body: unknown) =>
  send(app, "PUT", `/api/entities/${kind}/${id}`, body)
const merge = (kind: string, id: string, into: string) =>
  send(app, "POST", `/api/entities/${kind}/${id}/merge`, { into })
const remove = (kind: string, id: string) =>
  send(app, "DELETE", `/api/entities/${kind}/${id}`)
const patchDive = (id: string, fields: Record<string, unknown>) =>
  send(app, "PATCH", `/api/dives/${id}`, { fields })

const getLog = async () =>
  (await (await app.request("/api/log", { headers: apiHeaders })).json()) as Log

const journal = () =>
  db.prepare("SELECT type, payload FROM ops ORDER BY seq").all() as {
    type: string
    payload: string
  }[]

const aliases = () =>
  db.prepare("SELECT id, kind, target_id AS target FROM aliases").all()

const body = async (res: Response) =>
  (await res.json()) as Record<string, unknown>

// 20 July 2026 at Sodwana, one 12-hour CNS chain: fixture dive 58 on
// EANx32, then an air dive whose CNS carries over from it.
const first = () => diveId(db, 58)
const second = () =>
  db
    .prepare("SELECT id FROM dives WHERE start_time = '2026-07-20T09:57:21'")
    .pluck()
    .get() as string
// A draft logged offline after the change being tested.
const draft = {
  opVersion,
  deviceId: "device-phone",
  at: "2026-10-20T10:00:00Z",
}
const lateDive = () => ({
  startTime: "2026-10-19T09:00:00",
  siteId: sodwana,
  duration: 2400,
  maxDepth: 12,
})

const cns = (id: string) =>
  db.prepare("SELECT cns FROM dives WHERE id = ?").pluck().get(id) as number

describe("PUT /api/entities/:kind/:id", () => {
  it("creates each kind for a new id and journals it", async () => {
    const created = [
      ["region", "region-cape", { name: "Cape Town", countryCode: "ZA" }],
      [
        "site",
        "site-long-beach",
        { name: "Long Beach", countryCode: "ZA", regionId: "region-cape" },
      ],
      ["person", "person-sam", { name: "Sam Naidoo" }],
      [
        "diveCentre",
        "centre-pisces",
        { name: "Pisces", regionId: "region-cape" },
      ],
      ["trip", "trip-cape", { name: "Cape 2026" }],
    ] as const
    for (const [kind, id, fields] of created) {
      expect((await put(kind, id, fields)).status).toBe(200)
    }
    const log = await getLog()
    expect(log.regions).toContainEqual({
      id: "region-cape",
      name: "Cape Town",
      countryCode: "ZA",
    })
    // The water type is written at save, from the body of water.
    expect(log.sites).toContainEqual({
      id: "site-long-beach",
      name: "Long Beach",
      countryCode: "ZA",
      regionId: "region-cape",
      bodyOfWater: null,
      waterType: "salt",
    })
    expect(log.people).toEqual([{ id: "person-sam", name: "Sam Naidoo" }])
    expect(log.diveCentres).toEqual([
      { id: "centre-pisces", name: "Pisces", regionId: "region-cape" },
    ])
    expect(log.trips).toEqual([{ id: "trip-cape", name: "Cape 2026" }])
    expect(
      journal()
        .slice(-5)
        .map((entry) => entry.type)
    ).toEqual(Array(5).fill("putEntity"))
  })

  it("switches the water type only with a new body of water, unless one is sent", async () => {
    const site = async () =>
      (await getLog()).sites.find((s) => s.id === sodwana)
    await put("site", sodwana, { bodyOfWater: "lakeQuarry" })
    expect(await site()).toMatchObject({
      bodyOfWater: "lakeQuarry",
      waterType: "fresh",
    })
    await put("site", sodwana, { bodyOfWater: "oceanSea", waterType: "fresh" })
    expect(await site()).toMatchObject({ waterType: "fresh" })
    // Resending the stored body of water keeps a water type set by hand.
    const { version } = await body(
      await put("site", sodwana, { bodyOfWater: "oceanSea", name: "Sodwana" })
    )
    expect(await site()).toMatchObject({ waterType: "fresh" })
    expect((await getLog()).version).toBe(version)
    await put("site", sodwana, { bodyOfWater: null })
    expect(await site()).toMatchObject({
      bodyOfWater: null,
      waterType: "fresh",
    })
    await put("site", sodwana, { bodyOfWater: "pool", waterType: "salt" })
    expect(await site()).toMatchObject({ waterType: "salt" })
  })

  it("renames with only the changed fields and writes nothing when repeated", async () => {
    const res = await put("site", sodwana, { name: "Two Mile Reef" })
    expect(res.status).toBe(200)
    const { version } = await body(res)
    const entries = journal().length
    const again = await body(
      await put("site", sodwana, { name: "Two Mile Reef" })
    )
    expect(again.version).toBe(version)
    expect(journal()).toHaveLength(entries)
    const site = (await getLog()).sites.find((s) => s.id === sodwana)
    expect(site).toMatchObject({ name: "Two Mile Reef", countryCode: "ZA" })
  })

  it("refuses a rename that collides, naming the entity it collides with", async () => {
    const res = await put("site", unnamed, { name: " sodwana " })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: "There is already a site called Sodwana",
      path: ["name"],
      conflict: { id: sodwana, name: "Sodwana" },
    })
    // A new id with a taken name is refused the same way.
    const created = await put("site", "site-new", {
      name: "Sodwana",
      countryCode: "ZA",
    })
    expect(created.status).toBe(409)
  })

  it("allows the same name in another country", async () => {
    const res = await put("site", unnamed, {
      name: "Sodwana",
      countryCode: "MZ",
    })
    expect(res.status).toBe(200)
  })

  it("refuses a region in another country than its site", async () => {
    await put("region", "region-tofo", { name: "Tofo", countryCode: "MZ" })
    const res = await put("site", sodwana, { regionId: "region-tofo" })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ path: ["regionId"] })
  })

  it("moves a region's sites when its country changes", async () => {
    await put("region", "region-north", {
      name: "North coast",
      countryCode: "ZA",
    })
    await put("site", sodwana, { regionId: "region-north" })
    expect(
      (await put("region", "region-north", { countryCode: "MZ" })).status
    ).toBe(200)
    const log = await getLog()
    expect(log.sites.find((s) => s.id === sodwana)?.countryCode).toBe("MZ")

    // A site already there with the same name refuses the whole move.
    await put("region", "region-north", { countryCode: "ZA" })
    await put("site", "site-mz", { name: "Sodwana", countryCode: "MZ" })
    const res = await put("region", "region-north", { countryCode: "MZ" })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({
      path: ["countryCode"],
      conflict: { id: "site-mz", name: "Sodwana" },
    })
    expect(
      (await getLog()).regions.find((r) => r.id === "region-north")
    ).toMatchObject({ countryCode: "ZA" })
  })

  it("checks the body against the full fields for a new id, and the changes for a known one", async () => {
    expect((await put("site", "site-x", { name: "X" })).status).toBe(400)
    expect((await put("site", sodwana, { countryCode: null })).status).toBe(400)
    expect((await put("trip", "site-x", { name: "X" })).status).toBe(400)
    expect((await put("boat", "boat-x", { name: "X" })).status).toBe(404)
  })
})

describe("POST /api/entities/:kind/:id/merge", () => {
  it("moves a site's dives, records an alias, deletes it and journals", async () => {
    const res = await merge("site", unnamed, sodwana)
    expect(res.status).toBe(200)
    const log = await getLog()
    expect(log.sites.map((s) => s.id)).toEqual([sodwana])
    expect(new Set(log.dives.map((d) => d.siteId))).toEqual(new Set([sodwana]))
    expect(aliases()).toEqual([{ id: unnamed, kind: "site", target: sodwana }])
    expect(journal().at(-1)).toEqual({
      type: "mergeEntity",
      payload: JSON.stringify({ kind: "site", id: unnamed, into: sodwana }),
    })
  })

  it("writes nothing when retried, and refuses merging into itself", async () => {
    const { version } = await body(await merge("site", unnamed, sodwana))
    const again = await merge("site", unnamed, sodwana)
    expect(again.status).toBe(200)
    expect((await body(again)).version).toBe(version)
    expect((await merge("site", sodwana, sodwana)).status).toBe(422)
  })

  it("lands a draft naming the merged-away site on the survivor", async () => {
    await merge("site", unnamed, sodwana)
    const res = await send(app, "POST", "/api/ops", {
      ops: [
        {
          ...draft,
          opId: "op-late",
          type: "upsertDive",
          diveId: "dive-late",
          fields: { ...lateDive(), siteId: unnamed },
        },
      ],
    })
    expect(res.status).toBe(200)
    expect(
      (await getLog()).dives.find((d) => d.id === "dive-late")?.siteId
    ).toBe(sodwana)
  })

  it("rewrites the region of sites and dive centres for a region merge, within one country", async () => {
    await put("region", "region-a", { name: "Sodwana Bay", countryCode: "ZA" })
    await put("region", "region-b", { name: "Sodwana", countryCode: "ZA" })
    await put("site", sodwana, { regionId: "region-a" })
    await put("diveCentre", "centre-a", {
      name: "Coral Divers",
      regionId: "region-a",
    })
    expect((await merge("region", "region-a", "region-b")).status).toBe(200)
    const log = await getLog()
    expect(log.sites.find((s) => s.id === sodwana)?.regionId).toBe("region-b")
    expect(log.diveCentres[0].regionId).toBe("region-b")
    expect(log.regions.map((r) => r.id)).toEqual(["region-b"])

    // A stale copy naming the merged-away region changes nothing.
    const { version } = await body(
      await put("site", sodwana, { name: "Sodwana" })
    )
    const stale = await put("site", sodwana, { regionId: "region-a" })
    expect((await body(stale)).version).toBe(version)

    await put("region", "region-mz", { name: "Tofo", countryCode: "MZ" })
    const res = await merge("region", "region-b", "region-mz")
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({
      error: "The regions are in different countries",
    })
  })

  it("moves people onto the survivor, which keeps its own role on a dive with both", async () => {
    await put("person", "person-sam-n", { name: "Sam N" })
    await put("person", "person-sam", { name: "Sam Naidoo" })
    await put("person", "person-lee", { name: "Lee" })
    // Both on the first dive, in different roles; only Sam N on the second.
    await patchDive(first(), {
      buddies: ["person-sam-n", "person-lee"],
      diveProfessionals: ["person-sam"],
    })
    await patchDive(second(), { diveProfessionals: ["person-sam-n"] })
    expect((await merge("person", "person-sam-n", "person-sam")).status).toBe(
      200
    )

    const links = (await getLog()).links.filter((l) => l.type !== "tag")
    expect(links.filter((l) => l.diveId === first())).toEqual([
      { diveId: first(), type: "buddy", target: "person-lee", position: 1 },
      {
        diveId: first(),
        type: "professional",
        target: "person-sam",
        position: 0,
      },
    ])
    expect(links.filter((l) => l.diveId === second())).toEqual([
      {
        diveId: second(),
        type: "professional",
        target: "person-sam",
        position: 0,
      },
    ])
  })

  it("moves dive centres' dives", async () => {
    await put("diveCentre", "centre-a", { name: "Coral Divers" })
    await put("diveCentre", "centre-b", { name: "Coral Diver" })
    await patchDive(first(), { diveCentreId: "centre-a" })
    await merge("diveCentre", "centre-a", "centre-b")
    expect(
      (await getLog()).dives.find((d) => d.id === first())?.diveCentreId
    ).toBe("centre-b")
  })

  it("recalculates CNS carry-over for a trip merge", async () => {
    await put("trip", "trip-a", { name: "Sodwana 2026" })
    await put("trip", "trip-b", { name: "Sodwana July" })
    await patchDive(first(), { tripId: "trip-a" })
    await patchDive(second(), { tripId: "trip-b" })
    // In another trip, the dive before carries nothing over.
    expect(cns(second())).toBeLessThan(10)
    await merge("trip", "trip-b", "trip-a")
    expect(cns(second())).toBe(10)
  })
})

describe("DELETE /api/entities/:kind/:id", () => {
  it("refuses a site used only by a dive in Recently deleted", async () => {
    await put("site", "site-quiet", { name: "Quiet Reef", countryCode: "ZA" })
    await patchDive(first(), { siteId: "site-quiet" })
    await send(app, "DELETE", `/api/dives/${first()}`)
    const res = await remove("site", "site-quiet")
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({
      error:
        "This site is still used by 1 dive, so it can only be merged into another",
    })
  })

  it("unlinks a trip's dives, recalculates and allows it", async () => {
    await put("trip", "trip-a", { name: "Sodwana 2026" })
    await patchDive(second(), { tripId: "trip-a" })
    expect(cns(second())).toBeLessThan(10)
    expect((await remove("trip", "trip-a")).status).toBe(200)
    const log = await getLog()
    expect(log.trips).toEqual([])
    expect(log.dives.find((d) => d.id === second())?.tripId).toBeNull()
    expect(log.fieldMeta.filter((m) => m.field === "tripId")).toEqual([])
    // With no trip, the dive before counts again.
    expect(cns(second())).toBe(10)
  })

  it("refuses a region with sites or dive centres", async () => {
    await put("region", "region-a", { name: "Sodwana Bay", countryCode: "ZA" })
    await put("site", sodwana, { regionId: "region-a" })
    await put("diveCentre", "centre-a", {
      name: "Coral Divers",
      regionId: "region-a",
    })
    const res = await remove("region", "region-a")
    expect(res.status).toBe(409)
    expect((await body(res)).error).toBe(
      "This region is still used by 1 site and 1 dive centre, so it can only be merged into another"
    )
  })

  it("refuses a person or dive centre on a dive", async () => {
    await put("person", "person-sam", { name: "Sam Naidoo" })
    await put("diveCentre", "centre-a", { name: "Coral Divers" })
    await patchDive(first(), {
      diveProfessionals: ["person-sam"],
      diveCentreId: "centre-a",
    })
    expect((await remove("person", "person-sam")).status).toBe(409)
    expect((await remove("diveCentre", "centre-a")).status).toBe(409)
  })

  it("deletes each kind nothing uses, once, leaving a tombstone", async () => {
    const unused = [
      ["site", "site-a", { name: "A", countryCode: "ZA" }],
      ["region", "region-a", { name: "A", countryCode: "ZA" }],
      ["person", "person-a", { name: "A" }],
      ["diveCentre", "centre-a", { name: "A" }],
      ["trip", "trip-a", { name: "A" }],
    ] as const
    for (const [kind, id, fields] of unused) {
      await put(kind, id, fields)
      const { version } = await body(await remove(kind, id))
      expect(journal().at(-1)).toEqual({
        type: "deleteEntity",
        payload: JSON.stringify({ kind, id }),
      })
      const again = await remove(kind, id)
      expect(again.status).toBe(200)
      expect((await body(again)).version).toBe(version)
      // A stale form can't bring it back.
      expect((await put(kind, id, fields)).status).toBe(409)
    }
    expect(
      db.prepare("SELECT id, kind FROM deleted_entities ORDER BY kind").all()
    ).toHaveLength(5)
    expect((await remove("person", "person-never")).status).toBe(404)
  })

  it("rejects a re-sent draft that creates a deleted entity", async () => {
    await put("person", "person-gone", { name: "Gone" })
    await remove("person", "person-gone")
    const res = await send(app, "POST", "/api/ops", {
      ops: [
        {
          ...draft,
          opId: "op-person",
          type: "upsertEntity",
          kind: "person",
          id: "person-gone",
          fields: { name: "Gone" },
        },
        {
          ...draft,
          opId: "op-dive",
          type: "upsertDive",
          diveId: "dive-late",
          fields: { ...lateDive(), buddies: ["person-gone"] },
        },
      ],
    })
    expect(res.status).toBe(422)
    expect((await body(res)).error).toBe("A person on this dive was deleted")
  })
})
