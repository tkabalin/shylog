import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Profile } from "@/api/client"

import { LogDb, type Dive } from "./db"
import {
  forgetProfiles,
  LoadFailed,
  loadProfile,
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
