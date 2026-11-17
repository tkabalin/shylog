import { latestSchemaVersion } from "@shylog/core"
import fc from "fast-check"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Log } from "@/api/client"

import { fuzzOptions } from "../../../../packages/core/test/reference/fuzz"
import { collections, LogDb } from "./db"
import { deleteDraft, QueueDb, saveDraft } from "./drafts"
import { readLog, type LogView } from "./log"
import { syncLog } from "./sync"

const dive = (id: string, startTime: string, number: number) =>
  ({
    id,
    number,
    startTime,
    siteId: "site-a",
    duration: 2520,
    maxDepth: 32.66,
    deletedAt: null,
  }) as Log["dives"][number]

const site = (id: string, name: string) => ({
  id,
  name,
  countryCode: "ZA",
  regionId: null,
  bodyOfWater: "oceanSea" as const,
  waterType: "salt" as const,
})

const source = (diveId: string, field: string, computerValue: number) => ({
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
  dives: [
    dive("dive-a", "2026-07-22T08:12:19", 1),
    dive("dive-b", "2026-10-25T09:00:00", 2),
  ],
  sites: [site("site-a", "Sodwana"), site("site-b", "Aliwal")],
  countries: ["ZA"],
  regions: [{ id: "region-kzn", name: "KwaZulu-Natal", countryCode: "ZA" }],
  people: [{ id: "person-sam", name: "Sam Naidoo" }],
  diveCentres: [],
  trips: [],
  links: [
    { diveId: "dive-a", type: "buddy", target: "person-sam", position: 0 },
    { diveId: "dive-b", type: "buddy", target: "person-sam", position: 0 },
  ],
  fieldMeta: [
    source("dive-a", "maxDepth", 31.2),
    source("dive-b", "maxDepth", 18.1),
  ],
  settings: { diverName: "", maxPo2: 1.4, newDiveDefaults: {} },
  cards: [],
  packing: { sections: [] },
  ...overrides,
})

const sync = (body: Log, to = db) =>
  syncLog({ db: to, fetch: vi.fn(async () => Response.json(body)) })

const read = async () => (await readLog(db, queue)).log!

let db: LogDb
let queue: QueueDb
beforeEach(() => {
  db = new LogDb(`test-${crypto.randomUUID()}`)
  queue = new QueueDb(`test-queue-${crypto.randomUUID()}`)
})
afterEach(async () => {
  await Promise.all([db.delete(), queue.delete()])
})

// dive-b's notes and its field source changed, and site-b was renamed.
const edited = log("v2", {
  dives: [
    dive("dive-a", "2026-07-22T08:12:19", 1),
    { ...dive("dive-b", "2026-10-25T09:00:00", 2), notes: "Turtle" },
  ],
  sites: [site("site-a", "Sodwana"), site("site-b", "Aliwal Shoal")],
  fieldMeta: [
    source("dive-a", "maxDepth", 31.2),
    source("dive-b", "maxDepth", 18.4),
  ],
})

describe("the log in memory", () => {
  it("keeps the objects of everything a new version left alone", async () => {
    await sync(log("v1"))
    const first = await read()
    await sync(edited)
    const second = await read()

    expect(second.dive.get("dive-a")).toBe(first.dive.get("dive-a"))
    expect(second.dives.at(-1)).toBe(first.dives.at(-1))
    expect(second.sites.get("site-a")).toBe(first.sites.get("site-a"))
    expect(second.links.get("dive-a")).toBe(first.links.get("dive-a"))
    expect(second.links.get("dive-b")).toBe(first.links.get("dive-b"))
    expect(second.fieldMeta.get("dive-a")).toBe(first.fieldMeta.get("dive-a"))
    for (const map of ["regions", "people", "cards"] as const)
      expect(second[map]).toBe(first[map])
    // And new ones for what changed.
    expect(second.dive.get("dive-b")).toMatchObject({ notes: "Turtle" })
    expect(second.sites.get("site-b")).toMatchObject({ name: "Aliwal Shoal" })
    expect(second.fieldMeta.get("dive-b")?.get("maxDepth")).toMatchObject({
      computerValue: 18.4,
    })
  })

  it("reads nothing back from IndexedDB for a version this tab wrote", async () => {
    await sync(log("v1"))
    const read = vi.spyOn(db.dives, "toArray")
    expect((await readLog(db, queue)).log?.version).toBe("v1")
    expect(read).not.toHaveBeenCalled()
  })

  it("reads another tab's version from IndexedDB, keeping what it left alone", async () => {
    await sync(log("v1"))
    const first = await read()
    const other = new LogDb(db.name)
    await sync(edited, other)
    other.close()

    const second = await read()
    expect(second.version).toBe("v2")
    expect(second.dive.get("dive-a")).toBe(first.dive.get("dive-a"))
    expect(second.links.get("dive-a")).toBe(first.links.get("dive-a"))
    expect(second.dive.get("dive-b")).toMatchObject({ notes: "Turtle" })
  })

  it("lists rows in key order, fetched or read back", async () => {
    // The server sends sites by name.
    await sync(
      log("v1", {
        sites: [site("site-b", "Aliwal"), site("site-a", "Sodwana")],
      })
    )
    const fetched = await read()
    const other = new LogDb(db.name)
    const { log: reread } = await readLog(other, queue)
    other.close()
    expect([...fetched.sites.keys()]).toEqual(["site-a", "site-b"])
    expect([...reread!.sites.keys()]).toEqual(["site-a", "site-b"])
  })

  it("copies a synced dive a draft renumbers, and the maps its entities join", async () => {
    await sync(log("v1"))
    const before = await read()
    // Earlier than dive-b, so dive-b will move up once it uploads.
    await saveDraft(
      "dive-new",
      {
        startTime: "2026-10-20T09:00:00",
        siteId: "site-new",
        duration: 2700,
        maxDepth: 18.4,
      },
      [
        {
          kind: "site",
          id: "site-new",
          fields: { name: "Two-mile Reef", countryCode: "ZA" },
        },
      ],
      queue
    )
    const drafted = await read()
    expect(drafted.dive.get("dive-b")?.number).toBe(3)
    expect(drafted.dive.get("dive-new")?.provisional).toBe(2)
    expect(drafted.dives.map((dive) => dive.id)).toEqual([
      "dive-b",
      "dive-new",
      "dive-a",
    ])
    expect(drafted.sites.get("site-new")?.name).toBe("Two-mile Reef")
    // The mirror's own objects are as they were.
    expect(drafted.dive.get("dive-a")).toBe(before.dive.get("dive-a"))
    expect(before.dive.get("dive-b")?.number).toBe(2)
    expect(before.sites.has("site-new")).toBe(false)

    await deleteDraft("dive-new", queue)
    const after = await read()
    expect(after.dive.get("dive-b")).toBe(before.dive.get("dive-b"))
    expect(after.sites).toBe(before.sites)
  })

  it("lays a draft over the synced dive with its id, leaving the synced row", async () => {
    await sync(log("v1"))
    const before = await read()
    await saveDraft(
      "dive-a",
      {
        startTime: "2026-07-22T08:12:19",
        siteId: "site-a",
        duration: 2520,
        maxDepth: 32.66,
        notes: "Edited offline",
        buddies: [],
      },
      [],
      queue
    )
    const drafted = await read()
    expect(drafted.dive.get("dive-a")).toMatchObject({
      draft: true,
      notes: "Edited offline",
    })
    expect(drafted.links.get("dive-a")?.buddies).toEqual([])
    expect(before.links.get("dive-a")?.buddies).toEqual(["person-sam"])

    await deleteDraft("dive-a", queue)
    expect((await read()).dive.get("dive-a")).toBe(before.dive.get("dive-a"))
  })
})

// Each row in one of three versions, or left out, so a chain of logs adds,
// changes and drops rows of every kind.
const variants = (n: number) =>
  fc.array(fc.option(fc.integer({ min: 0, max: 2 }), { nil: undefined }), {
    minLength: n,
    maxLength: n,
  })
const picks = fc.record({
  dives: variants(4),
  sites: variants(3),
  people: variants(3),
  links: variants(4),
  fieldMeta: variants(4),
  cards: variants(2),
  maxPo2: fc.constantFrom(1.4, 1.5),
})
type Picks = typeof picks extends fc.Arbitrary<infer T> ? T : never

const linkSets: ((diveId: string) => Log["links"])[] = [
  (diveId) => [{ diveId, type: "buddy", target: "person-0", position: 0 }],
  (diveId) => [
    { diveId, type: "buddy", target: "person-1", position: 0 },
    { diveId, type: "buddy", target: "person-0", position: 1 },
    { diveId, type: "tag", target: "night", position: 0 },
  ],
  (diveId) => [{ diveId, type: "tag", target: "wreck", position: 0 }],
]

const sourceSets: ((diveId: string) => Log["fieldMeta"])[] = [
  (diveId) => [source(diveId, "maxDepth", 31.2)],
  (diveId) => [
    source(diveId, "maxDepth", 31.4),
    { ...source(diveId, "duration", 2500), source: "computer" },
  ],
  (diveId) => [
    { ...source(diveId, "notes", 0), computerValue: null, dismissed: true },
  ],
]

function generated(version: string, picked: Picks): Log {
  const present = <T>(
    list: (number | undefined)[],
    make: (i: number, v: number) => T
  ) => list.flatMap((v, i) => (v === undefined ? [] : [make(i, v)]))
  const dives = present(picked.dives, (i, v) => ({
    ...dive(`dive-${i}`, `2026-07-0${i + 1}T08:00:00`, i + 1),
    maxDepth: 20 + v,
    notes: v === 2 ? "Turtle" : null,
    sparkline: v ? [4, 10 + v, 5] : null,
  }))
  const logged = new Set(dives.map((dive) => dive.id))
  const ofDives = <T extends { diveId: string }>(rows: T[][]) =>
    rows.flat().filter((row) => logged.has(row.diveId))
  return log(version, {
    dives,
    sites: present(picked.sites, (i, v) => site(`site-${i}`, `Site ${i}.${v}`)),
    people: present(picked.people, (i, v) => ({
      id: `person-${i}`,
      name: `Person ${i}.${v}`,
    })),
    links: ofDives(present(picked.links, (i, v) => linkSets[v]!(`dive-${i}`))),
    fieldMeta: ofDives(
      present(picked.fieldMeta, (i, v) => sourceSets[v]!(`dive-${i}`))
    ),
    cards: present(picked.cards, (i, v) => ({
      id: `card-${i}`,
      name: "Open Water",
      images: [`hash-${v}`],
      thumb: null,
    })),
    settings: { diverName: "", maxPo2: picked.maxPo2, newDiveDefaults: {} },
  })
}

describe("a chain of syncs", () => {
  it("writes what one sync of the last version would, keeping unchanged rows' objects", async () => {
    // As JSON, so equal rows are those a reader couldn't tell apart.
    const json = (value: unknown) =>
      JSON.stringify(value, (_, v: unknown) => (v instanceof Map ? [...v] : v))
    const same = (a: unknown, b: unknown) => json(a) === json(b)
    await fc.assert(
      fc.asyncProperty(
        fc.array(picks, { minLength: 2, maxLength: 4 }),
        async (chain) => {
          const chained = new LogDb(`test-${crypto.randomUUID()}`)
          const direct = new LogDb(`test-${crypto.randomUUID()}`)
          const reread = [new LogDb(chained.name), new LogDb(direct.name)]
          try {
            const clear = vi.spyOn(chained.dives, "clear")
            let before: LogView | undefined
            for (const [i, picked] of chain.entries()) {
              await sync(generated(`v${i}`, picked), chained)
              const now = (await readLog(chained, queue)).log!
              for (const map of [
                "dive",
                "sites",
                "people",
                "fieldMeta",
                "links",
              ] as const)
                for (const [id, row] of now[map] as Map<string, unknown>) {
                  const was = (before?.[map] as Map<string, unknown>)?.get(id)
                  if (same(was, row)) expect(row).toBe(was)
                }
              before = now
            }
            // Only the first sync replaced the tables.
            expect(clear).toHaveBeenCalledOnce()
            await sync(generated(`v${chain.length - 1}`, chain.at(-1)!), direct)
            for (const name of collections)
              expect(await chained[name].toArray()).toEqual(
                await direct[name].toArray()
              )
            expect(await chained.meta.get("log")).toEqual(
              await direct.meta.get("log")
            )
            // And another tab reading the two from IndexedDB sees the same.
            const [fromChain, fromDirect] = await Promise.all(
              reread.map(async (db) => (await readLog(db, queue)).log)
            )
            expect(fromChain).toEqual(fromDirect)
            expect(before).toEqual(fromChain)
          } finally {
            for (const db of reread) db.close()
            await Promise.all([chained.delete(), direct.delete()])
          }
        }
      ),
      fuzzOptions(131, 40)
    )
  })
})
