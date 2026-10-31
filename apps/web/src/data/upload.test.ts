import type { Op } from "@shylog/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "./db"
import { queue, saveDraft } from "./drafts"
import { syncLog } from "./sync"
import { upload } from "./upload"

// upload() runs on the app's own databases and fetch. The log a sync lands
// is reduced to the dives the server has taken, which is all the queue
// checks before it drops a draft.
vi.mock("./log", () => ({ loadLog: vi.fn(async () => {}) }))
vi.mock("./last-sync", () => ({ noteSynced: vi.fn(async () => {}) }))
vi.mock("./sync", () => ({ syncLog: vi.fn() }))

let uploaded: string[]
beforeEach(() => {
  uploaded = []
  vi.mocked(syncLog).mockImplementation(async () => {
    await db.dives.bulkPut(uploaded.map((id) => ({ id }) as never))
    return "updated"
  })
})
afterEach(async () => {
  vi.unstubAllGlobals()
  // The app's own instances, so they must open again for the next test.
  const reopen = { disableAutoOpen: false }
  await Promise.all([db.delete(reopen), queue.delete(reopen)])
})

// Takes each upload, after `gate` when one is given.
function server(gate?: Promise<void>) {
  let called!: () => void
  const first = new Promise<void>((resolve) => (called = resolve))
  const fetch = vi.fn(async (_: RequestInfo | URL, init?: RequestInit) => {
    called()
    await gate
    const { ops } = JSON.parse(String(init?.body)) as { ops: Op[] }
    uploaded.push(ops.find((op) => op.type === "upsertDive")!.diveId)
    return Response.json({ result: "applied", version: "v2" })
  })
  vi.stubGlobal("fetch", fetch)
  return { fetch, first }
}

const draft = (id: `dive-${string}`) =>
  saveDraft(
    id,
    {
      startTime: "2026-10-20T09:00:00",
      siteId: "site-a",
      duration: 2700,
      maxDepth: 18.4,
    },
    [],
    queue
  )

describe("upload", () => {
  it("goes round again for a draft saved while it runs", async () => {
    await draft("dive-first")
    let open!: () => void
    const { first } = server(new Promise((resolve) => (open = resolve)))
    const run = upload()
    await first
    await draft("dive-second")
    expect(upload()).toBe(run)
    open()
    await run
    expect(uploaded).toEqual(["dive-first", "dive-second"])
    expect(await queue.drafts.count()).toBe(0)
  })

  it("starts a new run for a call after the last has ended", async () => {
    server()
    const done = upload()
    await done
    await draft("dive-new")
    const next = upload()
    expect(next).not.toBe(done)
    await next
    expect(uploaded).toEqual(["dive-new"])
  })

  it("stops quietly when offline, and tries again on the next call", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {})
    await draft("dive-new")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch")
      })
    )
    await expect(upload()).resolves.toBeUndefined()
    expect(await queue.drafts.count()).toBe(1)

    server()
    await upload()
    expect(uploaded).toEqual(["dive-new"])
    expect(await queue.drafts.count()).toBe(0)
  })
})
