import { opVersion, unknownSite } from "@shylog/core"
import { beforeEach, describe, expect, it } from "vitest"

import { apiHeaders, send, testApp } from "../../test/app.ts"
import { diveId, seededDb } from "../../test/fixture.ts"
import { matchOrCreate } from "../apply/entity.ts"
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

const reserved =
  "Unknown site is kept for imported dives. Give it another name."

// 20 July 2026 at Sodwana, one 12-hour CNS chain: fixture dive 58 on
// EANx32, then an air dive whose CNS carries over from it.
const first = () => diveId(db, 58)
const second = () =>
  db
    .prepare("SELECT id FROM dives WHERE start_time = '2026-07-20T09:57:21'")
    .pluck()
    .get() as string
// A draft logged offline after the change being tested, stamped now: the
// server refuses drafts more than two years old.
const draft = {
  opVersion,
  deviceId: "device-phone",
  at: new Date().toISOString(),
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

  it("refuses a new site or a rename taking the Unknown site's name and country", async () => {
    // Before any import has made it, it would become the Unknown site.
    for (const res of [
      await put("site", "site-new", {
        name: "Unknown Site",
        countryCode: "ZA",
      }),
      await put("site", unnamed, { name: "unknown site" }),
    ]) {
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: reserved, path: ["name"] })
    }
    // A site called that in another country can't move to South Africa.
    await put("site", "site-mz", { name: "Unknown site", countryCode: "MZ" })
    expect((await put("site", "site-mz", { countryCode: "ZA" })).status).toBe(
      409
    )
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

describe("POST /api/entities/:kind/:id/dives", () => {
  const setDives = (kind: string, id: string, request: unknown) =>
    send(app, "POST", `/api/entities/${kind}/${id}/dives`, request)
  const tripOf = (id: string) =>
    db.prepare("SELECT trip_id FROM dives WHERE id = ?").pluck().get(id)
  const roles = (personId: string) =>
    db
      .prepare(
        `SELECT dive_id AS diveId, 'buddy' AS role FROM dive_buddies WHERE person_id = ?
         UNION SELECT dive_id, 'professional' FROM dive_professionals WHERE person_id = ?
         ORDER BY role`
      )
      .all(personId, personId)

  it("creates a trip with its dives in one journalled write, moving one from another trip", async () => {
    await put("trip", "trip-old", { name: "Sodwana July" })
    await patchDive(first(), { tripId: "trip-old" })
    const before = journal().length
    const res = await setDives("trip", "trip-new", {
      create: { name: "Sodwana 2026" },
      add: [second()],
    })
    expect(res.status).toBe(200)
    expect(tripOf(second())).toBe("trip-new")
    // In another trip, the dive before carries nothing over.
    expect(cns(second())).toBeLessThan(10)
    expect(
      journal()
        .slice(before)
        .map((entry) => entry.type)
    ).toEqual(["setEntityDives"])

    await setDives("trip", "trip-new", { add: [first()] })
    expect(tripOf(first())).toBe("trip-new")
    expect(cns(second())).toBe(10)
    const log = await getLog()
    expect(
      log.fieldMeta
        .filter((meta) => meta.field === "tripId")
        .map(({ diveId, source }) => ({ diveId, source }))
    ).toEqual(
      expect.arrayContaining([
        { diveId: first(), source: "hand" },
        { diveId: second(), source: "hand" },
      ])
    )
  })

  it("refuses a new one with no dives, and saves nothing when a dive is refused", async () => {
    const none = await setDives("trip", "trip-new", {
      create: { name: "Sodwana 2026" },
    })
    expect(none.status).toBe(400)
    await send(app, "DELETE", `/api/dives/${first()}`)
    const before = journal().length
    const refused = await setDives("trip", "trip-new", {
      create: { name: "Sodwana 2026" },
      add: [second(), first()],
    })
    expect(refused.status).toBe(409)
    expect((await getLog()).trips).toEqual([])
    expect(tripOf(second())).toBeNull()
    expect(journal()).toHaveLength(before)
  })

  it("refuses a name another one has, naming it", async () => {
    await put("diveCentre", "centre-a", { name: "Coral Divers" })
    const res = await setDives("diveCentre", "centre-b", {
      create: { name: "Coral Divers" },
      add: [first()],
    })
    expect(res.status).toBe(409)
    expect(await body(res)).toMatchObject({
      conflict: { id: "centre-a" },
    })
  })

  it("moves a dive between dive centres and takes one off only its own", async () => {
    await put("diveCentre", "centre-a", { name: "Coral Divers" })
    await put("diveCentre", "centre-b", { name: "Da Blu Juice" })
    await patchDive(first(), { diveCentreId: "centre-a" })
    await setDives("diveCentre", "centre-b", { add: [first()] })
    const centreOf = () =>
      db
        .prepare("SELECT dive_centre_id FROM dives WHERE id = ?")
        .pluck()
        .get(first())
    expect(centreOf()).toBe("centre-b")
    const { version } = await body(
      await setDives("diveCentre", "centre-a", { remove: [first()] })
    )
    expect(centreOf()).toBe("centre-b")
    expect(version).toBe(
      (
        await body(
          await setDives("diveCentre", "centre-a", { remove: [first()] })
        )
      ).version
    )
  })

  it("adds a person in a role, switches it, and writes nothing when resent", async () => {
    await put("person", "person-sam", { name: "Sam Naidoo" })
    await setDives("person", "person-sam", {
      add: [
        { diveId: first(), role: "buddy" },
        { diveId: second(), role: "professional" },
      ],
    })
    expect(roles("person-sam")).toEqual([
      { diveId: first(), role: "buddy" },
      { diveId: second(), role: "professional" },
    ])
    const switched = { add: [{ diveId: first(), role: "professional" }] }
    const { version } = await body(
      await setDives("person", "person-sam", switched)
    )
    expect(roles("person-sam")).toEqual(
      expect.arrayContaining([{ diveId: first(), role: "professional" }])
    )
    expect(roles("person-sam")).toHaveLength(2)
    const again = await body(await setDives("person", "person-sam", switched))
    expect(again.version).toBe(version)
    // A person's dives need a role.
    expect(
      (await setDives("person", "person-sam", { add: [first()] })).status
    ).toBe(400)
  })

  it("deletes an emptied one when asked, unless a dive in Recently deleted still has it", async () => {
    await setDives("trip", "trip-a", {
      create: { name: "Sodwana 2026" },
      add: [first()],
    })
    await setDives("trip", "trip-a", { remove: [first()], deleteIfEmpty: true })
    expect((await getLog()).trips).toEqual([])
    expect(
      db
        .prepare("SELECT kind FROM deleted_entities WHERE id = 'trip-a'")
        .pluck()
        .get()
    ).toBe("trip")

    await setDives("person", "person-sam", {
      create: { name: "Sam Naidoo" },
      add: [
        { diveId: first(), role: "buddy" },
        { diveId: second(), role: "buddy" },
      ],
    })
    await send(app, "DELETE", `/api/dives/${first()}`)
    expect(
      (
        await setDives("person", "person-sam", {
          remove: [second()],
          deleteIfEmpty: true,
        })
      ).status
    ).toBe(200)
    expect((await getLog()).people).toEqual([
      { id: "person-sam", name: "Sam Naidoo" },
    ])
  })

  it("keeps each dive's calculated surface interval", async () => {
    const interval = () =>
      db
        .prepare("SELECT surface_interval FROM dives WHERE id = ?")
        .pluck()
        .get(second())
    const before = interval()
    expect(before).not.toBeNull()
    await setDives("person", "person-sam", {
      create: { name: "Sam Naidoo" },
      add: [{ diveId: second(), role: "buddy" }],
    })
    await setDives("diveCentre", "centre-a", {
      create: { name: "Coral Divers" },
      add: [second()],
    })
    expect(interval()).toBe(before)
  })

  it("writes nothing when a create or a delete is resent", async () => {
    const created = { create: { name: "Sodwana 2026" }, add: [first()] }
    const { version } = await body(await setDives("trip", "trip-a", created))
    const again = await setDives("trip", "trip-a", created)
    expect(again.status).toBe(200)
    expect((await body(again)).version).toBe(version)

    const emptied = { remove: [first()], deleteIfEmpty: true }
    const deleted = await body(await setDives("trip", "trip-a", emptied))
    const resent = await setDives("trip", "trip-a", emptied)
    expect(resent.status).toBe(200)
    expect((await body(resent)).version).toBe(deleted.version)
  })

  it("deletes an emptied trip whose other dive is in Recently deleted, unlinking it", async () => {
    await setDives("trip", "trip-a", {
      create: { name: "Sodwana 2026" },
      add: [first(), second()],
    })
    await send(app, "DELETE", `/api/dives/${first()}`)
    await setDives("trip", "trip-a", {
      remove: [second()],
      deleteIfEmpty: true,
    })
    expect((await getLog()).trips).toEqual([])
    expect(tripOf(first())).toBeNull()
  })

  it("skips taking off a dive put in Recently deleted since", async () => {
    await setDives("trip", "trip-a", {
      create: { name: "Sodwana 2026" },
      add: [first(), second()],
    })
    await send(app, "DELETE", `/api/dives/${first()}`)
    const res = await setDives("trip", "trip-a", {
      remove: [first(), second()],
    })
    expect(res.status).toBe(200)
    expect(tripOf(first())).toBe("trip-a")
    expect(tripOf(second())).toBeNull()
  })

  it("adds under a merged-away id to the survivor, but takes none off it", async () => {
    await put("trip", "trip-a", { name: "Sodwana 2026" })
    await put("trip", "trip-b", { name: "Sodwana July" })
    await merge("trip", "trip-a", "trip-b")
    await setDives("trip", "trip-a", { add: [first()] })
    expect(tripOf(first())).toBe("trip-b")
    const res = await setDives("trip", "trip-a", { remove: [first()] })
    expect(res.status).toBe(409)
    expect(tripOf(first())).toBe("trip-b")
  })

  it("names the dive it refuses", async () => {
    await send(app, "DELETE", `/api/dives/${first()}`)
    const res = await setDives("trip", "trip-a", {
      create: { name: "Sodwana 2026" },
      add: [second(), first()],
    })
    expect(res.status).toBe(409)
    expect(await body(res)).toMatchObject({
      error: "This dive is in Recently deleted",
      path: ["add", 1],
      diveId: first(),
    })
  })

  it("is only for trips, dive centres and people", async () => {
    expect((await setDives("site", sodwana, { add: [first()] })).status).toBe(
      404
    )
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

describe("the Unknown site", () => {
  const unknown = "site-unknown"
  const refused = {
    error:
      "Unknown site holds dives your dive computer gave no site, so it can’t be changed",
  }
  const stored = () =>
    db.prepare("SELECT * FROM sites WHERE id = ?").get(unknown)
  // Made as an import makes it, since the route refuses its name.
  beforeEach(async () => {
    matchOrCreate(db, "site", unknown, { ...unknownSite, waterType: "salt" })
    await patchDive(first(), { siteId: unknown })
  })

  it("refuses an edit, keeping it as it was", async () => {
    const before = stored()
    for (const fields of [
      { name: "Aliwal Shoal" },
      { countryCode: "MZ" },
      { bodyOfWater: "lakeQuarry" },
      { waterType: "fresh" },
    ]) {
      const res = await put("site", unknown, fields)
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual(refused)
    }
    expect(stored()).toEqual(before)
  })

  it("refuses a merge either way and a delete, even once nothing uses it", async () => {
    for (const res of [
      await merge("site", unknown, sodwana),
      await merge("site", unnamed, unknown),
    ]) {
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual(refused)
    }
    expect(aliases()).toEqual([])
    await patchDive(first(), { siteId: sodwana })
    expect((await remove("site", unknown)).status).toBe(409)
    expect(stored()).toBeDefined()
  })

  it("is found under an id merged into it before", async () => {
    // An alias can only come from a journal written before the lock.
    db.prepare(
      "INSERT INTO aliases (id, kind, target_id) VALUES ('site-old', 'site', ?)"
    ).run(unknown)
    const res = await merge("site", unnamed, "site-old")
    expect(await res.json()).toEqual(refused)
  })

  it("keeps its name from a rename, offering no merge into it", async () => {
    const res = await put("site", unnamed, { name: "unknown site" })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: reserved, path: ["name"] })
  })

  it("keeps a region it is in, from before the lock, in South Africa", async () => {
    await put("region", "region-kzn", { name: "KZN", countryCode: "ZA" })
    db.prepare("UPDATE sites SET region_id = 'region-kzn' WHERE id = ?").run(
      unknown
    )
    const res = await put("region", "region-kzn", { countryCode: "MZ" })
    expect(res.status).toBe(409)
    expect((await body(res)).error).toBe(
      "Unknown site is in this region, so it stays in South Africa"
    )
    expect(stored()).toMatchObject({ country_code: "ZA" })
    // Another region still changes country.
    await put("region", "region-cape", { name: "Cape", countryCode: "ZA" })
    expect(
      (await put("region", "region-cape", { countryCode: "MZ" })).status
    ).toBe(200)
  })

  it("leaves another country's Unknown site alone", async () => {
    await put("site", "site-mz", { name: "Unknown site", countryCode: "MZ" })
    expect((await put("site", "site-mz", { name: "Tofo" })).status).toBe(200)
  })
})
