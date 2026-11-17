import { latestSchemaVersion } from "@shylog/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Log } from "@/api/client"

import { NoAnswer } from "./client-log"
import { collections, LogDb, type Meta } from "./db"
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

// A field typed by hand, with the computer's reading beside it.
const source = (diveId: string, field: string, computerValue = 0) => ({
  diveId,
  field,
  source: "hand" as const,
  computerValue,
  dismissed: false,
})

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
    newDiveDefaults: {},
  },
  cards: [],
  packing: { sections: [] },
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
    expect(await db.diveLinks.get("dive-a")).toEqual({
      diveId: "dive-a",
      rows: [
        { diveId: "dive-a", type: "buddy", target: "person-sam", position: 0 },
      ],
    })
    expect(await db.meta.get("log")).toMatchObject({
      version: "v1",
      settings: { maxPo2: 1.4 },
      packing: { sections: [] },
    })
  })

  it("shows the fetched log before it writes it", async () => {
    let written: unknown = "unread"
    let current: boolean | undefined
    const show = vi.fn(async (_: unknown, check: () => Promise<boolean>) => {
      written = await db.meta.get("log")
      current = await check()
    })
    await syncLog({ db, fetch: server(() => log("v1")), show })
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ version: "v1" }),
      }),
      expect.any(Function)
    )
    expect(written).toBeUndefined()
    expect(current).toBe(true)
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
    expect(await db.diveLinks.count()).toBe(0)
  })

  it("writes only the rows a new version changed, and deletes those it dropped", async () => {
    let current = log("v1", {
      dives: [
        dive("dive-a", "2026-07-22T08:12:19"),
        dive("dive-b", "2026-07-23T08:00:00"),
      ],
      fieldMeta: [
        source("dive-a", "maxDepth", 31.2),
        source("dive-b", "duration"),
      ],
    })
    const fetch = server(() => current)
    await syncLog({ db, fetch })
    const kept = { digest: "[]", samples: [], events: [] }
    await db.profiles.bulkPut([
      { diveId: "dive-a", ...kept },
      { diveId: "dive-b", ...kept },
    ])
    const clear = vi.spyOn(db.dives, "clear")
    const put = {
      dives: vi.spyOn(db.dives, "bulkPut"),
      sites: vi.spyOn(db.sites, "bulkPut"),
      people: vi.spyOn(db.people, "bulkPut"),
      links: vi.spyOn(db.diveLinks, "bulkPut"),
      fieldMeta: vi.spyOn(db.diveFieldMeta, "bulkPut"),
    }
    const changed = { ...dive("dive-a", "2026-07-22T08:12:19"), maxDepth: 30 }
    const lerato = { id: "person-lerato", name: "Lerato Mokoena" }
    current = log("v2", {
      dives: [changed],
      people: [...current.people, lerato],
      fieldMeta: [source("dive-a", "maxDepth", 29.8)],
    })
    expect(await syncLog({ db, fetch })).toBe("updated")

    expect(clear).not.toHaveBeenCalled()
    expect(put.dives).toHaveBeenCalledExactlyOnceWith([changed])
    expect(put.people).toHaveBeenCalledExactlyOnceWith([lerato])
    expect(put.fieldMeta).toHaveBeenCalledExactlyOnceWith([
      { diveId: "dive-a", rows: [source("dive-a", "maxDepth", 29.8)] },
    ])
    expect(put.sites).not.toHaveBeenCalled()
    expect(put.links).not.toHaveBeenCalled()
    expect(await db.diveFieldMeta.count()).toBe(1)
    expect((await db.profiles.toArray()).map((p) => p.diveId)).toEqual([
      "dive-a",
    ])
    // Just as a whole sync of the same version leaves the mirror.
    const fresh = new LogDb(`test-${crypto.randomUUID()}`)
    await syncLog({ db: fresh, fetch: server(() => current) })
    for (const name of collections)
      expect(await db[name].toArray()).toEqual(await fresh[name].toArray())
    expect(await db.meta.get("log")).toEqual(await fresh.meta.get("log"))
    await fresh.delete()
  })

  it("replaces every table when another tab wrote the mirror since this one did", async () => {
    await syncLog({ db, fetch: server(() => log("v1")) })
    const other = new LogDb(db.name)
    await syncLog({
      db: other,
      fetch: server(() =>
        log("v2", { dives: [dive("dive-b", "2026-07-23T08:00:00")] })
      ),
    })
    other.close()
    const clear = vi.spyOn(db.dives, "clear")
    expect(await syncLog({ db, fetch: server(() => log("v3")) })).toBe(
      "updated"
    )
    expect(clear).toHaveBeenCalledOnce()
    expect((await db.dives.toArray()).map((d) => d.id)).toEqual(["dive-a"])
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
    let current: boolean | undefined
    const show = vi.fn(async (_: unknown, check: () => Promise<boolean>) => {
      current = await check()
    })
    expect(await syncLog({ db, fetch, show })).toBe("updated")
    // Shown, the older log would hide v3's dive until the read after it.
    expect(current).toBe(false)
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

  it("counts a proxy's 502 or 504 as no answer, as the server is down", async () => {
    for (const status of [502, 504]) {
      const fetch = vi.fn(async () => new Response("Bad Gateway", { status }))
      await expect(syncLog({ db, fetch })).rejects.toBeInstanceOf(NoAnswer)
    }
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
