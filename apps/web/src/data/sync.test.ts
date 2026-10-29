import { latestSchemaVersion } from "@shylog/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Log } from "@/api/client"

import { LogDb, type Meta } from "./db"
import { lastSync, noteSynced, readLastSync } from "./last-sync"
import { syncLog } from "./sync"

const dive = (id: string, startTime: string) =>
  ({
    id,
    number: 1,
    startTime,
    siteId: "site-a",
    duration: 2520,
    maxDepth: 32.66,
  }) as Log["dives"][number]

const log = (version: string, overrides: Partial<Log> = {}): Log => ({
  schemaVersion: latestSchemaVersion,
  version,
  serverTime: "2026-10-22T10:00:00.000Z",
  dives: [dive("dive-a", "2026-07-22T08:12:19")],
  sites: [
    {
      id: "site-a",
      name: "Sodwana",
      countryCode: "ZA",
      regionId: null,
      bodyOfWater: "oceanSea",
      waterType: "salt",
    },
  ],
  countries: ["ZA", "VN"],
  regions: [],
  people: [{ id: "person-sam", name: "Sam Naidoo" }],
  diveCentres: [],
  trips: [],
  links: [
    { diveId: "dive-a", type: "buddy", target: "person-sam", position: 0 },
  ],
  fieldMeta: [],
  settings: {
    diverName: "",
    maxPo2: 1.4,
    newDiveDefaults: { visibilityMode: "metres" },
  },
  cards: [],
  ...overrides,
})

// A stand-in for the server: answers 304 when the ETag matches.
function server(body: () => Log) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const sent = new Headers(init?.headers).get("If-None-Match")
    const current = body()
    expect(String(input)).toMatch(/\/api\/log$/)
    expect(new Headers(init?.headers).get("X-Shylog")).toBe("1")
    if (sent === `"${current.version}"`)
      return new Response(null, { status: 304 })
    return Response.json(current, { headers: { ETag: `"${current.version}"` } })
  })
}

let db: LogDb
beforeEach(() => {
  db = new LogDb(`test-${crypto.randomUUID()}`)
})
afterEach(async () => {
  await db.delete()
})

describe("syncLog", () => {
  it("lands the log in the mirror in one transaction", async () => {
    const transaction = vi.spyOn(db, "transaction")
    const fetch = server(() => log("v1"))
    expect(await syncLog({ db, fetch })).toBe("updated")
    expect(transaction).toHaveBeenCalledOnce()

    expect(await db.dives.toArray()).toEqual([
      dive("dive-a", "2026-07-22T08:12:19"),
    ])
    expect(await db.countries.toArray()).toEqual([
      { code: "VN" },
      { code: "ZA" },
    ])
    expect(await db.links.get(["dive-a", "buddy", "person-sam"])).toEqual({
      diveId: "dive-a",
      type: "buddy",
      target: "person-sam",
      position: 0,
    })
    expect(await db.meta.get("log")).toMatchObject({
      version: "v1",
      settings: { maxPo2: 1.4 },
    })
  })

  it("replaces what an older version held", async () => {
    let current = log("v1")
    const fetch = server(() => current)
    await syncLog({ db, fetch })
    current = log("v2", {
      dives: [dive("dive-b", "2026-07-23T08:00:00")],
      people: [],
      links: [],
    })
    expect(await syncLog({ db, fetch })).toBe("updated")
    expect((await db.dives.toArray()).map((d) => d.id)).toEqual(["dive-b"])
    expect(await db.people.count()).toBe(0)
    expect(await db.links.count()).toBe(0)
  })

  it("drops the kept profiles of dives the log no longer has", async () => {
    const kept = { digest: "[]", samples: [], events: [] }
    await db.profiles.bulkPut([
      { diveId: "dive-a", ...kept },
      { diveId: "dive-gone", ...kept },
    ])
    await syncLog({ db, fetch: server(() => log("v1")) })
    expect((await db.profiles.toArray()).map((p) => p.diveId)).toEqual([
      "dive-a",
    ])
  })

  it("leaves the mirror untouched on a 304", async () => {
    const fetch = server(() => log("v1"))
    await syncLog({ db, fetch })
    const put = vi.spyOn(db.dives, "bulkPut")
    const clear = vi.spyOn(db.dives, "clear")
    expect(await syncLog({ db, fetch })).toBe("unchanged")
    expect(
      new Headers(fetch.mock.calls[1][1]?.headers).get("If-None-Match")
    ).toBe('"v1"')
    expect(put).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
    expect(await db.dives.count()).toBe(1)
  })

  it("stops syncing on a newer schemaVersion and flags it", async () => {
    let current = log("v1")
    const fetch = server(() => current)
    await syncLog({ db, fetch })
    current = log("v2", { schemaVersion: latestSchemaVersion + 1, dives: [] })

    expect(await syncLog({ db, fetch })).toBe("blocked")
    expect(await db.meta.get("blocked")).toEqual({
      key: "blocked",
      schemaVersion: latestSchemaVersion + 1,
      version: "v2",
    })
    // The old copy stays readable; later checks cost a 304.
    expect(await db.dives.count()).toBe(1)
    expect(await syncLog({ db, fetch })).toBe("blocked")
    expect(
      new Headers(fetch.mock.calls[2][1]?.headers).get("If-None-Match")
    ).toBe('"v2"')
    expect(await db.meta.get("log")).toMatchObject({ version: "v1" })
  })

  it("syncs again once the server is back on a schema it knows", async () => {
    let current = log("v2", { schemaVersion: latestSchemaVersion + 1 })
    const fetch = server(() => current)
    expect(await syncLog({ db, fetch })).toBe("blocked")
    // A restore or a rolled-back image.
    current = log("v3")
    expect(await syncLog({ db, fetch })).toBe("updated")
    expect(await db.meta.get("blocked")).toBeUndefined()
    expect(await db.meta.get("log")).toMatchObject({ version: "v3" })
  })

  it("keeps a newer log another tab wrote while it fetched", async () => {
    await syncLog({ db, fetch: server(() => log("v1")) })
    const fetch = vi.fn(async () => {
      // The other tab lands v3 before this tab's older v2 reply arrives.
      const meta = (await db.meta.get("log")) as Meta
      await db.meta.put({ ...meta, version: "v3" })
      return Response.json(log("v2", { dives: [] }))
    })
    expect(await syncLog({ db, fetch })).toBe("updated")
    expect(await db.meta.get("log")).toMatchObject({ version: "v3" })
    expect(await db.dives.count()).toBe(1)
  })

  it("throws on a failed request, keeping the mirror", async () => {
    await syncLog({ db, fetch: server(() => log("v1")) })
    const fetch = vi.fn(
      async () => new Response("Login not allowed", { status: 403 })
    )
    await expect(syncLog({ db, fetch })).rejects.toThrow("403")
    expect(await db.dives.count()).toBe(1)
  })
})

describe("readLastSync", () => {
  it("knows when a sync last reached the server", async () => {
    expect(lastSync()).toBeUndefined()
    await db.meta.put({ key: "synced", at: "2026-10-29T08:00:00.000Z" })
    await readLastSync(db)
    expect(lastSync()).toBe("2026-10-29T08:00:00.000Z")
    // A newer time this launch noted isn't replaced by the stored one.
    await noteSynced(db)
    const noted = lastSync()
    await db.meta.put({ key: "synced", at: "2026-10-29T08:00:00.000Z" })
    await readLastSync(db)
    expect(lastSync()).toBe(noted)
  })
})
