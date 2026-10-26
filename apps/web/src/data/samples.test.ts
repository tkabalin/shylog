import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Profile } from "@/api/client"

import { LogDb, type Dive } from "./db"
import {
  downloadProfiles,
  forgetProfiles,
  LoadFailed,
  loadProfile,
  outcome,
  retryProfile,
} from "./samples"

const dive = (sparkline: number[] | null = [0, 10, 0], id = "dive-a") =>
  ({
    id,
    sparkline,
    ascentAlarmCount: 1,
    sampleDuration: 2400,
    sampleAverageDepth: 18.2,
  }) as Dive

const profile: Profile = {
  samples: [{ time: 20, depth: 10.5, temperature: 22, pressure: null }],
  events: [{ type: "ascent", start: 290, end: 311 }],
}

function server(body: Profile = profile, status = 200) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toMatch(/\/api\/dives\/dive-[a-z0-9]+\/samples$/)
    expect(new Headers(init?.headers).get("X-Shylog")).toBe("1")
    return Response.json(body, { status })
  })
}

let db: LogDb
beforeEach(() => {
  db = new LogDb(`test-${crypto.randomUUID()}`)
  forgetProfiles()
})
afterEach(() => db.delete())

describe("loadProfile", () => {
  it("fetches a dive's samples and keeps them on the phone", async () => {
    const fetch = server()
    expect(await loadProfile(dive(), { db, fetch })).toEqual(profile)
    // Written in the background, so the chart needn't wait for it.
    await vi.waitFor(async () =>
      expect(await db.profiles.get("dive-a")).toMatchObject({
        diveId: "dive-a",
        ...profile,
      })
    )
  })

  it("marks the promise with its outcome, as React's use() reads it", async () => {
    const loaded = loadProfile(dive(), { db, fetch: server() })
    expect(loaded).toHaveProperty("status", "pending")
    await loaded
    expect(loaded).toMatchObject({ status: "fulfilled", value: profile })
    const failing = loadProfile(dive(null), { db, fetch: server(profile, 500) })
    await failing.catch(() => {})
    expect(failing).toHaveProperty("status", "rejected")
  })

  it("makes no request for a dive already on the phone", async () => {
    await loadProfile(dive(), { db, fetch: server() })
    await vi.waitFor(async () => expect(await db.profiles.count()).toBe(1))
    forgetProfiles()
    const fetch = server()
    expect(await loadProfile(dive(), { db, fetch })).toEqual(profile)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("shares one request between a prefetch and the chart", async () => {
    const fetch = server()
    const [a, b] = await Promise.all([
      loadProfile(dive(), { db, fetch }),
      loadProfile(dive(), { db, fetch }),
    ])
    expect(a).toBe(b)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it("fetches again once the dive's profile has changed", async () => {
    await loadProfile(dive(), { db, fetch: server() })
    await vi.waitFor(async () => expect(await db.profiles.count()).toBe(1))
    forgetProfiles()
    const replaced = { ...profile, events: [] }
    const fetch = server(replaced)
    expect(await loadProfile(dive([0, 12, 0]), { db, fetch })).toEqual(replaced)
    // An alarm added with the same depths changes the digest too.
    const again = server(profile)
    const more = { ...dive([0, 12, 0]), ascentAlarmCount: 2 }
    expect(await loadProfile(more, { db, fetch: again })).toEqual(profile)
    expect(fetch).toHaveBeenCalledOnce()
    expect(again).toHaveBeenCalledOnce()
  })

  it("keeps the 50 dives used most recently in memory", async () => {
    const fetch = server()
    const first = loadProfile(dive([0, 10, 0], "dive-0"), { db, fetch })
    for (let i = 1; i <= 50; i++) {
      await loadProfile(dive([0, 10, 0], `dive-${i}`), { db, fetch })
    }
    expect(loadProfile(dive([0, 10, 0], "dive-0"), { db, fetch })).not.toBe(
      first
    )
    // dive-1 was dropped next, so dive-50 is still the same promise.
    const latest = loadProfile(dive([0, 10, 0], "dive-50"), { db, fetch })
    expect(loadProfile(dive([0, 10, 0], "dive-50"), { db, fetch })).toBe(latest)
  })

  it("keeps a failure until it is retried, so a re-render can't loop", async () => {
    const failing = server(profile, 500)
    await expect(loadProfile(dive(), { db, fetch: failing })).rejects.toThrow(
      LoadFailed
    )
    await expect(loadProfile(dive(), { db, fetch: failing })).rejects.toThrow(
      "500"
    )
    expect(failing).toHaveBeenCalledOnce()
    expect(await db.profiles.count()).toBe(0)

    retryProfile(dive())
    expect(await loadProfile(dive(), { db, fetch: server() })).toEqual(profile)
  })

  it("leaves a load in flight or done alone on a retry", async () => {
    const fetch = server()
    const first = loadProfile(dive(), { db, fetch })
    retryProfile(dive())
    expect(loadProfile(dive(), { db, fetch })).toBe(first)
    await first
    retryProfile(dive())
    expect(loadProfile(dive(), { db, fetch })).toBe(first)
  })

  it("calls an unreachable server a load failure", async () => {
    const fetch = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    await expect(loadProfile(dive(), { db, fetch })).rejects.toThrow(LoadFailed)
  })

  it("still fetches when IndexedDB refuses", async () => {
    vi.spyOn(db.profiles, "get").mockRejectedValue(new Error("refused"))
    vi.spyOn(db.profiles, "put").mockRejectedValue(new Error("refused"))
    expect(await loadProfile(dive(), { db, fetch: server() })).toEqual(profile)
  })
})

describe("downloadProfiles", () => {
  // The batch endpoint: every dive asked for, unless it's in `none`.
  function batchServer(none: string[] = [], status = 200) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      expect(url.pathname).toBe("/api/samples")
      const ids = url.searchParams.get("ids")!.split(",")
      expect(ids.length).toBeLessThanOrEqual(25)
      const profiles = Object.fromEntries(
        ids.filter((id) => !none.includes(id)).map((id) => [id, profile])
      )
      return Response.json({ profiles }, { status })
    })
  }
  const dives = (n: number) =>
    Array.from({ length: n }, (_, i) => dive([0, 10, 0], `dive-${i}`))
  // As a sync leaves them: a profile is kept only for a dive the log has.
  beforeEach(async () => {
    await db.dives.bulkPut(dives(60))
  })

  it("keeps every dive's profile on the phone, 25 dives a request", async () => {
    const fetch = batchServer()
    await downloadProfiles(dives(60), { db, fetch })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(await db.profiles.count()).toBe(60)
    // Opening one now makes no request.
    const open = vi.fn()
    expect(
      await loadProfile(dive([0, 10, 0], "dive-7"), { db, fetch: open })
    ).toEqual(profile)
    expect(open).not.toHaveBeenCalled()
  })

  it("asks only for profiles missing or changed since they were kept", async () => {
    await downloadProfiles(dives(3), { db, fetch: batchServer() })
    const fetch = batchServer()
    const changed = { ...dive([0, 10, 0], "dive-1"), ascentAlarmCount: 2 }
    await db.dives.put(changed)
    await downloadProfiles(
      [dive([0, 10, 0], "dive-0"), changed, dive([0, 10, 0], "dive-9")],
      { db, fetch }
    )
    expect(fetch).toHaveBeenCalledOnce()
    const asked = new URL(String(fetch.mock.calls[0][0])).searchParams.get(
      "ids"
    )
    expect(asked).toBe("dive-1,dive-9")
  })

  it("skips dives with no samples and makes no request when all are kept", async () => {
    const fetch = batchServer()
    await downloadProfiles([dive(null, "dive-hand")], { db, fetch })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("skips dives in Recently deleted", async () => {
    const fetch = batchServer()
    const deleted = { ...dive([0, 10, 0], "dive-0"), deletedAt: "2026-10-01" }
    await downloadProfiles([deleted], { db, fetch })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("keeps nothing for a dive the server has no samples for", async () => {
    await downloadProfiles(dives(2), { db, fetch: batchServer(["dive-1"]) })
    expect((await db.profiles.toArray()).map((p) => p.diveId)).toEqual([
      "dive-0",
    ])
  })

  it("stops quietly when the server can't be reached, keeping what came", async () => {
    let calls = 0
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (calls++) throw new TypeError("Failed to fetch")
      return batchServer()(input)
    })
    await expect(downloadProfiles(dives(30), { db, fetch })).resolves.toBe(
      undefined
    )
    expect(await db.profiles.count()).toBe(25)
  })

  it("skips a batch the server refuses and goes on", async () => {
    let calls = 0
    const fetch = vi.fn(async (input: RequestInfo | URL) =>
      calls++ ? batchServer()(input) : Response.json({}, { status: 500 })
    )
    await downloadProfiles(dives(30), { db, fetch })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(await db.profiles.count()).toBe(5)
  })

  it("stops fetching once the phone can't keep what came", async () => {
    vi.spyOn(db.profiles, "bulkPut").mockRejectedValue(
      new DOMException("Full", "QuotaExceededError")
    )
    const fetch = batchServer()
    await downloadProfiles(dives(30), { db, fetch })
    await downloadProfiles(dives(30), { db, fetch })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it("keeps no profile for a dive a sync has since removed or changed", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      await db.dives.delete("dive-0")
      await db.dives.put({ ...dive([0, 10, 0], "dive-1"), sampleDuration: 9 })
      return batchServer()(input)
    })
    await downloadProfiles(dives(3), { db, fetch })
    expect((await db.profiles.toArray()).map((p) => p.diveId)).toEqual([
      "dive-2",
    ])
  })

  it("runs once at a time, then for the list a sync asked for meanwhile", async () => {
    const fetch = batchServer()
    const [a, b] = [
      downloadProfiles(dives(2), { db, fetch }),
      downloadProfiles(dives(3), { db, fetch }),
    ]
    expect(a).toBe(b)
    await a
    expect(fetch).toHaveBeenCalledTimes(2)
    const asked = new URL(String(fetch.mock.calls[1][0])).searchParams.get(
      "ids"
    )
    expect(asked).toBe("dive-2")
    expect(await db.profiles.count()).toBe(3)
  })
})

describe("outcome", () => {
  it("reads a load's state without waiting", async () => {
    const loaded = loadProfile(dive(), { db, fetch: server() })
    expect(outcome(loaded).status).toBe("pending")
    await loaded
    expect(outcome(loaded)).toMatchObject({
      status: "fulfilled",
      value: profile,
    })
  })
})
