import { latestSchemaVersion } from "@shylog/core"
import { Dexie } from "dexie"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Log } from "@/api/client"

import { LogDb } from "./db"
import { QueueDb } from "./drafts"
import { readLog } from "./log"
import { syncLog } from "./sync"

const v1: Log = {
  schemaVersion: latestSchemaVersion,
  version: "v1",
  serverTime: "2026-10-22T10:00:00.000Z",
  dives: [
    {
      id: "dive-a",
      number: 1,
      startTime: "2026-07-22T08:12:19",
      siteId: "site-a",
      deletedAt: null,
    } as Log["dives"][number],
  ],
  sites: [],
  countries: [],
  regions: [],
  people: [
    { id: "person-sam", name: "Sam Naidoo" },
    { id: "person-lerato", name: "Lerato Mokoena" },
  ],
  diveCentres: [],
  trips: [],
  links: [
    { diveId: "dive-a", type: "buddy", target: "person-sam", position: 0 },
  ],
  fieldMeta: [
    {
      diveId: "dive-a",
      field: "maxDepth",
      source: "hand",
      computerValue: 31.2,
      dismissed: false,
    },
  ],
  settings: { diverName: "", maxPo2: 1.4, newDiveDefaults: {} },
  cards: [],
  packing: { sections: [] },
}

// The mirror's schema up to version 5, with a link and a field source per row.
class Version5 extends Dexie {
  constructor(name: string) {
    super(name)
    this.version(1).stores({
      dives: "id",
      sites: "id",
      countries: "code",
      regions: "id",
      people: "id",
      diveCentres: "id",
      trips: "id",
      links: "[diveId+type+target]",
      fieldMeta: "[diveId+field]",
      cards: "id",
      meta: "key",
    })
    this.version(2).stores({ profiles: "diveId" })
    this.version(3).stores({ profiles: "diveId, [diveId+digest]" })
    this.version(4).stores({ cardImages: "[cardId+hash], heldUntil" })
    this.version(5).stores({})
  }
}

let db: LogDb
let queue: QueueDb
beforeEach(() => {
  db = new LogDb(`test-${crypto.randomUUID()}`)
  queue = new QueueDb(`test-queue-${crypto.randomUUID()}`)
})
afterEach(async () => {
  await Promise.all([db.delete(), queue.delete()])
})

describe("the upgrade from version 5", () => {
  it("keeps links and field sources as one row a dive, readable offline, and asks for the whole log", async () => {
    const old = new Version5(db.name)
    await old.table("meta").put({
      key: "log",
      version: "v1",
      schemaVersion: v1.schemaVersion,
      serverTime: v1.serverTime,
      settings: v1.settings,
      packing: v1.packing,
    })
    await old.table("dives").bulkPut(v1.dives)
    await old.table("people").bulkPut(v1.people)
    // Keyed by type and target, so the table holds them out of order.
    await old.table("links").bulkPut([
      { diveId: "dive-a", type: "buddy", target: "person-sam", position: 1 },
      { diveId: "dive-a", type: "buddy", target: "person-lerato", position: 0 },
      { diveId: "dive-a", type: "tag", target: "night", position: 0 },
    ])
    await old.table("fieldMeta").bulkPut(v1.fieldMeta)
    old.close()

    const { log: view } = await readLog(db, queue)
    expect(db.verno).toBe(6)
    expect(view?.version).toBe("")
    expect(view?.links.get("dive-a")).toEqual({
      buddies: ["person-lerato", "person-sam"],
      professionals: [],
      tags: ["night"],
    })
    expect(view?.fieldMeta.get("dive-a")?.get("maxDepth")).toEqual(
      v1.fieldMeta[0]
    )
    expect(await db.diveFieldMeta.toArray()).toEqual([
      { diveId: "dive-a", rows: v1.fieldMeta },
    ])

    let tag: string | null = "unsent"
    const fetch = vi.fn(async (_: RequestInfo | URL, init?: RequestInit) => {
      tag = new Headers(init?.headers).get("If-None-Match")
      return Response.json(v1)
    })
    const clear = vi.spyOn(db.dives, "clear")
    expect(await syncLog({ db, fetch })).toBe("updated")
    expect(tag).toBeNull()
    expect(clear).toHaveBeenCalledOnce()
    const { log: synced } = await readLog(db, queue)
    expect(synced?.links.get("dive-a")?.buddies).toEqual(["person-sam"])
  })
})
