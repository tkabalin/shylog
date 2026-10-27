import { latestSchemaVersion, opVersion, type Op } from "@shylog/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Log } from "@/api/client"

import { LogDb } from "./db"
import {
  deleteDraft,
  draftOps,
  editDraft,
  listDrafts,
  QueueDb,
  readDraft,
  rejectDraft,
  saveDraft,
  type DraftFields,
  type NewEntity,
} from "./drafts"
import { readLog } from "./log"
import { syncLog } from "./sync"
import { uploadDrafts } from "./upload"

const fields = (overrides: Partial<DraftFields> = {}): DraftFields => ({
  startTime: "2026-10-20T09:00:00",
  siteId: "site-new",
  duration: 2700,
  maxDepth: 18.4,
  buddies: ["person-sam"],
  tags: ["night"],
  notes: "Turtle at the drop-off",
  ...overrides,
})

const site: NewEntity = {
  kind: "site",
  id: "site-new",
  fields: { name: "Two-mile Reef", countryCode: "ZA", bodyOfWater: "oceanSea" },
}

const mirrorDive = (id: string, startTime: string, number = 1) =>
  ({
    id,
    number,
    startTime,
    siteId: "site-a",
    duration: 2520,
    maxDepth: 32.66,
    deletedAt: null,
  }) as Log["dives"][number]

const log = (
  version: string,
  dives = [mirrorDive("dive-a", "2026-07-22T08:12:19")]
): Log => ({
  schemaVersion: latestSchemaVersion,
  version,
  serverTime: "2026-10-22T10:00:00.000Z",
  dives,
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
  countries: ["ZA"],
  regions: [],
  people: [{ id: "person-sam", name: "Sam Naidoo" }],
  diveCentres: [],
  trips: [],
  links: [],
  fieldMeta: [],
  settings: {
    diverName: "",
    maxPo2: 1.4,
    newDiveDefaults: { visibilityMode: "metres" },
  },
  cards: [],
})

let db: LogDb
let queue: QueueDb
beforeEach(() => {
  db = new LogDb(`test-${crypto.randomUUID()}`)
  queue = new QueueDb(`test-queue-${crypto.randomUUID()}`)
})
afterEach(async () => {
  await Promise.all([db.delete(), queue.delete()])
})

describe("drafts", () => {
  it("saves the dive, its upsertDive op and an upsertEntity op for a new site in one transaction", async () => {
    const transaction = vi.spyOn(queue, "transaction")
    await saveDraft("dive-new", fields(), [site], queue)
    expect(transaction).toHaveBeenCalledOnce()

    expect(await readDraft("dive-new", queue)).toEqual({
      id: "dive-new",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      fields: fields(),
      entities: [site],
    })
    const ops = await draftOps("dive-new", queue)
    const deviceId = (await queue.meta.get("device"))!.id
    expect(deviceId).toMatch(/^device-/)
    const base = {
      opId: expect.stringMatching(/^op-/),
      opVersion,
      deviceId,
      at: expect.stringMatching(/Z$/),
    }
    expect(ops).toHaveLength(2)
    expect(ops).toContainEqual({
      ...base,
      type: "upsertDive",
      diveId: "dive-new",
      fields: fields(),
    })
    expect(ops).toContainEqual({ ...base, type: "upsertEntity", ...site })
  })

  it("keeps one device id for every draft", async () => {
    await saveDraft("dive-one", fields(), [], queue)
    await saveDraft("dive-two", fields(), [], queue)
    const devices = new Set(
      (await queue.ops.toArray()).map((row) => row.op.deviceId)
    )
    expect(devices.size).toBe(1)
  })

  it("refuses a dive the server would refuse, writing nothing", async () => {
    await expect(
      saveDraft("dive-bad", fields({ maxDepth: -3 }), [site], queue)
    ).rejects.toThrow()
    expect(await queue.drafts.count()).toBe(0)
    expect(await queue.ops.count()).toBe(0)
  })

  it("rewrites the ops with new op ids when edited", async () => {
    await saveDraft("dive-new", fields(), [site], queue)
    const before = await queue.ops.toCollection().primaryKeys()
    const saved = await readDraft("dive-new", queue)
    await rejectDraft(
      "dive-new",
      "This draft is more than two years old",
      before,
      queue
    )

    // The diver picks an existing site instead of the new one.
    const edited = fields({ siteId: "site-a", notes: "Two turtles" })
    await editDraft("dive-new", edited, [], queue)

    const ops = await queue.ops.toArray()
    expect(ops).toHaveLength(1)
    expect(before).not.toContain(ops[0].opId)
    expect(ops[0].op).toMatchObject({ type: "upsertDive", fields: edited })
    const draft = await readDraft("dive-new", queue)
    expect(draft).toEqual({
      id: "dive-new",
      createdAt: saved!.createdAt,
      updatedAt: expect.any(String),
      fields: edited,
      entities: [],
    })
  })

  it("removes the draft and its ops when deleted", async () => {
    await saveDraft("dive-new", fields(), [site], queue)
    await saveDraft("dive-kept", fields(), [], queue)
    await deleteDraft("dive-new", queue)
    expect(await readDraft("dive-new", queue)).toBeUndefined()
    expect(await draftOps("dive-new", queue)).toEqual([])
    expect(await draftOps("dive-kept", queue)).toHaveLength(1)
  })

  it("keeps a rejected draft with its reason", async () => {
    await saveDraft("dive-new", fields(), [site], queue)
    const sent = await queue.ops.toCollection().primaryKeys()
    await rejectDraft(
      "dive-new",
      "This dive is in Recently deleted",
      sent,
      queue
    )
    expect(await readDraft("dive-new", queue)).toMatchObject({
      rejected: "This dive is in Recently deleted",
    })
    expect(await queue.ops.count()).toBe(2)
  })

  it("has its own database and schema version, which a sync leaves alone", async () => {
    const real = new QueueDb()
    expect(real.name).toBe("shylog-queue")
    expect(real.name).not.toBe(new LogDb().name)
    await queue.open()
    await db.open()
    expect(queue.verno).toBe(1)
    expect(db.verno).toBe(3)

    await saveDraft("dive-new", fields(), [site], queue)
    await syncLog({ db, fetch: vi.fn(async () => Response.json(log("v1"))) })
    expect(await queue.drafts.count()).toBe(1)
    expect(await queue.ops.count()).toBe(2)
  })
})

// A stand-in for the server: answers each upload with `answer`, and the log
// with the dives uploaded so far.
function server(answer: (ops: Op[]) => Response | Promise<Response>) {
  const uploaded: string[] = []
  const requests: string[] = []
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(new Headers(init?.headers).get("X-Shylog")).toBe("1")
    const path = new URL(String(input)).pathname
    requests.push(path)
    if (path === "/api/log") {
      return Response.json(
        log(`v${uploaded.length + 1}`, [
          mirrorDive("dive-a", "2026-07-22T08:12:19"),
          ...uploaded.map((id, i) =>
            mirrorDive(id, "2026-10-20T09:00:00", i + 2)
          ),
        ])
      )
    }
    expect(path).toBe("/api/ops")
    const { ops } = JSON.parse(String(init?.body)) as { ops: Op[] }
    const res = await answer(ops)
    if (res.ok) {
      const dive = ops.find((op) => op.type === "upsertDive")!
      uploaded.push(dive.diveId)
    }
    return res
  })
  return { fetch, requests, uploaded }
}

const applied = () =>
  Response.json({
    result: "applied",
    version: "v2",
    serverTime: "2026-10-22T10:00:00.000Z",
  })

describe("uploadDrafts", () => {
  beforeEach(() =>
    syncLog({ db, fetch: vi.fn(async () => Response.json(log("v1"))) })
  )

  it("sends one draft per request, oldest first, and drops it once the log has the dive", async () => {
    await saveDraft("dive-first", fields(), [site], queue)
    await saveDraft("dive-second", fields({ siteId: "site-a" }), [], queue)
    const sent: Op[][] = []
    const {
      fetch: answer,
      requests,
      uploaded,
    } = server(async (ops) => {
      sent.push(ops)
      return applied()
    })
    // Still a draft while the log is fetched, so it never leaves the screen.
    const drafts: number[] = []
    const fetch: typeof answer = vi.fn(async (input, init) => {
      if (String(input).endsWith("/api/log"))
        drafts.push(await queue.drafts.count())
      return answer(input, init)
    })

    await uploadDrafts({ db, queue, fetch })
    expect(requests).toEqual(["/api/ops", "/api/log", "/api/ops", "/api/log"])
    expect(sent.map((ops) => ops.length)).toEqual([2, 1])
    expect(uploaded).toEqual(["dive-first", "dive-second"])
    expect(drafts).toEqual([2, 1])
    expect(await queue.drafts.count()).toBe(0)
    expect(await queue.ops.count()).toBe(0)
    expect(await db.dives.get("dive-second")).toBeDefined()
  })

  it("waits while the server runs a newer schema than the app knows", async () => {
    await saveDraft("dive-new", fields({ siteId: "site-a" }), [], queue)
    await db.meta.put({
      key: "blocked",
      schemaVersion: latestSchemaVersion + 1,
      version: "v9",
    })
    const fetch = vi.fn()
    await uploadDrafts({ db, queue, fetch })
    expect(fetch).not.toHaveBeenCalled()
    expect(await queue.drafts.count()).toBe(1)
  })

  it("drops a draft the server had already applied", async () => {
    await saveDraft("dive-new", fields({ siteId: "site-a" }), [], queue)
    const { fetch } = server(() =>
      Response.json({ result: "alreadyApplied", version: "v2", serverTime: "" })
    )
    await uploadDrafts({ db, queue, fetch })
    expect(await queue.drafts.count()).toBe(0)
    expect(await queue.ops.count()).toBe(0)
  })

  it("keeps a refused draft with the server's reason and sends the next", async () => {
    await saveDraft("dive-refused", fields(), [site], queue)
    await saveDraft("dive-next", fields({ siteId: "site-a" }), [], queue)
    const { fetch, uploaded } = server((ops) =>
      ops.some((op) => op.type === "upsertDive" && op.diveId === "dive-refused")
        ? Response.json(
            { error: "This dive is in Recently deleted", path: [] },
            { status: 422 }
          )
        : applied()
    )
    await uploadDrafts({ db, queue, fetch })
    expect(uploaded).toEqual(["dive-next"])
    expect(await listDrafts(queue)).toEqual([
      expect.objectContaining({
        id: "dive-refused",
        rejected: "This dive is in Recently deleted",
      }),
    ])
    expect(await draftOps("dive-refused", queue)).toHaveLength(2)

    // Not sent again until it is edited.
    fetch.mockClear()
    await uploadDrafts({ db, queue, fetch })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("stops on a network failure, leaving the queue", async () => {
    await saveDraft("dive-one", fields(), [site], queue)
    await saveDraft("dive-two", fields(), [], queue)
    const before = await queue.ops.toArray()
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    })
    await expect(uploadDrafts({ db, queue, fetch })).rejects.toThrow(
      "Failed to fetch"
    )
    expect(fetch).toHaveBeenCalledOnce()
    expect(await queue.ops.toArray()).toEqual(before)
    expect((await listDrafts(queue)).map((d) => d.rejected)).toEqual([
      undefined,
      undefined,
    ])
  })

  it("stops on a server error, leaving the queue", async () => {
    await saveDraft("dive-one", fields(), [site], queue)
    await saveDraft("dive-two", fields(), [], queue)
    const { fetch } = server(() =>
      Response.json(
        { error: "Saving is paused: the database failed its check" },
        { status: 503 }
      )
    )
    await expect(uploadDrafts({ db, queue, fetch })).rejects.toThrow("503")
    expect(fetch).toHaveBeenCalledOnce()
    expect(await queue.drafts.count()).toBe(2)
    expect(await queue.ops.count()).toBe(3)
  })

  it("keeps a draft edited while its upload was in flight", async () => {
    await saveDraft("dive-new", fields(), [site], queue)
    const { fetch } = server(async () => {
      await editDraft(
        "dive-new",
        fields({ notes: "Edited meanwhile" }),
        [site],
        queue
      )
      return applied()
    })
    await uploadDrafts({ db, queue, fetch })
    expect(await readDraft("dive-new", queue)).toMatchObject({
      fields: { notes: "Edited meanwhile" },
    })
    expect(await queue.ops.count()).toBe(2)
  })
})

describe("drafts in the log", () => {
  beforeEach(() =>
    syncLog({ db, fetch: vi.fn(async () => Response.json(log("v1"))) })
  )

  it("shows a draft as a dive, with its new site and links", async () => {
    await saveDraft(
      "dive-new",
      fields({ diveProfessionals: ["person-guide"] }),
      [
        site,
        { kind: "person", id: "person-guide", fields: { name: "Thandi" } },
      ],
      queue
    )
    const { log: view } = await readLog(db, queue)

    expect(view!.dives.map((dive) => dive.id)).toEqual(["dive-new", "dive-a"])
    expect(view!.dive.get("dive-new")).toMatchObject({
      id: "dive-new",
      draft: true,
      number: null,
      startTime: "2026-10-20T09:00:00",
      siteId: "site-new",
      diveType: "recreation",
      nitrox: false,
      notes: "Turtle at the drop-off",
      weight: null,
      cns: null,
      sparkline: null,
      deletedAt: null,
      surfaceIntervalOverride: false,
    })
    expect(view!.sites.get("site-new")).toEqual({
      id: "site-new",
      name: "Two-mile Reef",
      countryCode: "ZA",
      regionId: null,
      bodyOfWater: "oceanSea",
      waterType: "salt",
    })
    expect(view!.people.get("person-guide")).toEqual({
      id: "person-guide",
      name: "Thandi",
    })
    expect(view!.links.get("dive-new")).toEqual({
      buddies: ["person-sam"],
      professionals: ["person-guide"],
      tags: ["night"],
    })
  })

  it("shows a refused draft's reason", async () => {
    await saveDraft("dive-new", fields({ siteId: "site-a" }), [], queue)
    const sent = await queue.ops.toCollection().primaryKeys()
    await rejectDraft(
      "dive-new",
      "This draft is more than two years old",
      sent,
      queue
    )
    const { log: view } = await readLog(db, queue)
    expect(view!.dive.get("dive-new")).toMatchObject({
      draft: true,
      rejected: "This draft is more than two years old",
    })
  })

  it("puts a draft over the mirror's row for the same dive", async () => {
    await saveDraft(
      "dive-a",
      fields({ siteId: "site-a", notes: "Edited offline" }),
      [],
      queue
    )
    const { log: view } = await readLog(db, queue)
    expect(view!.dives).toHaveLength(1)
    expect(view!.dive.get("dive-a")).toMatchObject({
      draft: true,
      notes: "Edited offline",
    })
  })
})
