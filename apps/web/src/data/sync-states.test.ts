import { latestSchemaVersion } from "@shylog/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Log } from "@/api/client"

import type { DraftFields } from "./drafts"

// The stores outside React: a hook reads its snapshot directly, so the
// hooks run here as plain functions.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: (_: unknown, snapshot: () => unknown) => snapshot(),
}))
vi.mock("./samples", () => ({
  downloadProfiles: vi.fn(),
  pruneProfiles: vi.fn(),
}))
vi.mock("./cards", () => ({
  downloadCardImages: vi.fn(),
  forgetCardUrls: vi.fn(),
  warmCardImages: vi.fn(),
  pruneCardImages: vi.fn(),
}))

const log = (version: string, dives: Log["dives"] = []): Log => ({
  schemaVersion: latestSchemaVersion,
  version,
  serverTime: "2026-11-09T10:00:00.000Z",
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
  people: [],
  diveCentres: [],
  trips: [],
  links: [],
  fieldMeta: [],
  settings: { diverName: "", maxPo2: 1.4, newDiveDefaults: {} },
  cards: [],
})

const fields = (startTime: string): DraftFields => ({
  startTime,
  siteId: "site-a",
  duration: 2700,
  maxDepth: 18.4,
})

// Each test loads the module-level stores afresh.
let store: typeof import("./log")
let drafts: typeof import("./drafts")
let status: typeof import("./sync-status")
let upload: typeof import("./upload")
let online = true
beforeEach(async () => {
  vi.resetModules()
  online = true
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online)
  store = await import("./log")
  drafts = await import("./drafts")
  status = await import("./sync-status")
  upload = await import("./upload")
})
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  await (await import("./db")).db.delete()
  await drafts.queue.delete()
})

// A server that answers the log, and the given handler for uploads.
function server(ops: () => Promise<Response> = async () => Response.json({})) {
  const fetch = vi.fn(async (input: RequestInfo | URL) =>
    String(input).endsWith("/api/ops") ? ops() : Response.json(log("v1"))
  )
  vi.stubGlobal("fetch", fetch)
  return fetch
}

const state = () => status.useSyncStatus().state

// Waits on real ticks, which fake timers leave alone (vi.waitFor would move
// the faked clock on and blur the gaps being measured).
async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++)
    await new Promise((resolve) => setImmediate(resolve))
  expect(check()).toBe(true)
}

describe("the sync status", () => {
  it("is synced with an empty queue, which hides the badge", async () => {
    server()
    await store.sync()
    expect(status.useSyncStatus()).toMatchObject({
      state: "synced",
      unsynced: [],
    })
  })

  it("is offline when the phone says so, whatever else is going on", async () => {
    server()
    await store.sync()
    online = false
    expect(state()).toBe("offline")
    // Offline wins over a failed sync, which is no news then.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed")))
    await store.sync()
    expect(state()).toBe("offline")
  })

  it("is server unreachable when a fetch fails while online, and tries again soon", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    )
    await store.sync()
    expect(state()).toBe("unreachable")

    // Back after the first retry, five seconds on.
    const fetch = server()
    await vi.advanceTimersByTimeAsync(4999)
    expect(fetch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await until(() => state() === "synced")
  })

  it("backs off between retries, up to the five-minute check", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed"))
    vi.stubGlobal("fetch", fetch)
    // Each failure is logged once it is handled and the next retry is set.
    const failed = vi.spyOn(console, "debug").mockImplementation(() => {})
    await store.sync()
    const gaps = [5, 10, 20, 40, 80, 160, 300, 300]
    for (const seconds of gaps) {
      const before = fetch.mock.calls.length
      await vi.advanceTimersByTimeAsync(seconds * 1000 - 1)
      expect(fetch.mock.calls.length).toBe(before)
      await vi.advanceTimersByTimeAsync(1)
      await until(() => failed.mock.calls.length > before)
    }
  })

  it("doesn't call the server out of reach for a sync that failed offline", async () => {
    online = false
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed")))
    await store.sync()
    // Back online, before the online event's sync has answered.
    online = true
    expect(state()).not.toBe("unreachable")
  })

  it("waits for the online event rather than retrying offline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    online = false
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed"))
    vi.stubGlobal("fetch", fetch)
    await store.sync()
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it("is syncing while an upload is in flight, naming the dive", async () => {
    let answer!: (res: Response) => void
    server(() => new Promise((resolve) => (answer = resolve)))
    await store.sync()
    await drafts.saveDraft("dive-new", fields("2026-11-08T09:00:00"), [])
    await store.loadLog()
    const run = upload.upload()
    await vi.waitFor(() => expect(answer).toBeDefined())
    expect(status.useSyncStatus()).toMatchObject({
      state: "syncing",
      sending: { id: "dive-new" },
    })
    answer(Response.json({ error: "Site was deleted" }, { status: 422 }))
    await run
    // Only a refused draft is left, which the diver has to fix.
    expect(status.useSyncStatus()).toMatchObject({
      state: "refused",
      sending: undefined,
      unsynced: [{ id: "dive-new", rejected: "Site was deleted" }],
    })
  })

  it("is stuck, not unreachable, when the server answers an upload with an error, and backs off", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    vi.spyOn(console, "debug").mockImplementation(() => {})
    const fetch = server(async () => new Response("Paused", { status: 503 }))
    await store.sync()
    await drafts.saveDraft("dive-new", fields("2026-11-08T09:00:00"), [])
    await store.loadLog()
    await upload.upload()
    expect(status.useSyncStatus()).toMatchObject({
      state: "stuck",
      waiting: [{ id: "dive-new" }],
    })
    // Its own retries back off, and a sync that gets through resets nothing.
    const uploads = () =>
      fetch.mock.calls.filter(([url]) => String(url).endsWith("/api/ops"))
        .length
    await store.sync()
    await until(() => uploads() === 2)
    await vi.advanceTimersByTimeAsync(9999)
    expect(uploads()).toBe(2)
    await vi.advanceTimersByTimeAsync(1)
    await until(() => uploads() === 3)
    expect(state()).toBe("stuck")
  })

  it("is server unreachable when an upload gets no answer", async () => {
    server(async () => {
      throw new TypeError("Failed to fetch")
    })
    await store.sync()
    await drafts.saveDraft("dive-new", fields("2026-11-08T09:00:00"), [])
    await store.loadLog()
    await upload.upload()
    expect(state()).toBe("unreachable")
  })

  it("counts the dives on the phone and finds the oldest", () => {
    const view = {
      dives: [
        { id: "dive-b", draft: true, savedAt: "2026-11-08T10:00:00.000Z" },
        { id: "dive-a", draft: true, savedAt: "2026-11-07T10:00:00.000Z" },
        { id: "dive-x", number: 4 },
      ],
      dive: new Map(),
    } as unknown as import("./log").LogView
    const result = status.syncStatus({
      online: true,
      failed: false,
      blocked: false,
      sending: undefined,
      log: view,
    })
    expect(result.state).toBe("syncing")
    expect(result.unsynced.map((dive) => dive.id)).toEqual(["dive-b", "dive-a"])
    expect(result.oldest).toBe("2026-11-07T10:00:00.000Z")
  })

  it("is paused by a server on a newer schema", () => {
    expect(
      status.syncStatus({
        online: true,
        failed: false,
        blocked: true,
        sending: undefined,
        log: null,
      }).state
    ).toBe("paused")
  })
})

