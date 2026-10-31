import { latestSchemaVersion } from "@shylog/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Meta } from "./db"

// The store outside React: the hook reads the snapshot directly.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: (_: unknown, snapshot: () => unknown) => snapshot(),
}))
vi.mock("./sync", () => ({ syncLog: vi.fn() }))
vi.mock("./samples", () => ({ downloadProfiles: vi.fn() }))
vi.mock("./upload", () => ({ upload: vi.fn() }))
vi.mock("./last-sync", () => ({
  noteSynced: vi.fn(async () => {}),
  readLastSync: vi.fn(async () => {}),
}))

// The store, the run under way and the mocks live at module level, so each
// test loads them afresh.
let log: typeof import("./log")
let db: typeof import("./db").db
let syncLog: ReturnType<typeof vi.mocked<typeof import("./sync").syncLog>>
let upload: ReturnType<typeof vi.mocked<typeof import("./upload").upload>>
let downloadProfiles: ReturnType<
  typeof vi.mocked<typeof import("./samples").downloadProfiles>
>
beforeEach(async () => {
  vi.resetModules()
  log = await import("./log")
  db = (await import("./db")).db
  syncLog = vi.mocked((await import("./sync")).syncLog)
  upload = vi.mocked((await import("./upload")).upload)
  downloadProfiles = vi.mocked((await import("./samples")).downloadProfiles)
})
afterEach(async () => {
  await db.delete()
  await (await import("./drafts")).queue.delete()
})

// What a sync that lands a log leaves in the mirror.
const mirror = (version: string) =>
  db.meta.put({
    key: "log",
    version,
    schemaVersion: latestSchemaVersion,
    serverTime: "2026-10-22T10:00:00.000Z",
    settings: {
      diverName: "",
      maxPo2: 1.4,
      newDiveDefaults: { visibilityMode: "metres" },
    },
  } satisfies Meta)

const state = () => log.useLog()

describe("sync", () => {
  it("shares one run between calls made while it runs", async () => {
    let finish!: (result: "unchanged") => void
    syncLog.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const first = log.sync()
    expect(log.sync()).toBe(first)
    finish("unchanged")
    await first
    expect(syncLog).toHaveBeenCalledOnce()

    syncLog.mockResolvedValueOnce("unchanged")
    await log.sync()
    expect(syncLog).toHaveBeenCalledTimes(2)
  })

  it("reads an updated log, then downloads its profiles and sends any drafts", async () => {
    syncLog.mockImplementationOnce(async () => {
      await mirror("v1")
      return "updated"
    })
    await log.sync()
    expect(state()).toMatchObject({ loaded: true, failed: false })
    expect(log.currentLog()?.version).toBe("v1")
    expect(downloadProfiles).toHaveBeenCalledOnce()
    expect(upload).toHaveBeenCalledOnce()
  })

  it("reads the mirror again when another tab has synced it", async () => {
    await mirror("v1")
    await log.loadLog()
    await mirror("v2")
    syncLog.mockResolvedValueOnce("unchanged")
    await log.sync()
    expect(log.currentLog()?.version).toBe("v2")
  })

  it("says so when a sync fails, until the next one answers", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {})
    syncLog.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    await log.sync()
    expect(state().failed).toBe(true)

    syncLog.mockResolvedValueOnce("unchanged")
    await log.sync()
    expect(state().failed).toBe(false)
  })

  it("stops downloading and uploading for a server on a newer schema", async () => {
    await mirror("v1")
    syncLog.mockResolvedValueOnce("blocked")
    await log.sync()
    expect(state().blocked).toBe(true)
    expect(downloadProfiles).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
  })
})

describe("loadLog", () => {
  it("marks the log loaded, keeping the copy it had, when the read fails", async () => {
    await mirror("v1")
    await log.loadLog()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("Closed"))
    await log.loadLog()
    expect(state().loaded).toBe(true)
    expect(log.currentLog()?.version).toBe("v1")
  })

  it("marks an empty log loaded when the first read fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("Closed"))
    await log.loadLog()
    expect(state()).toMatchObject({ loaded: true, log: null })
  })
})
