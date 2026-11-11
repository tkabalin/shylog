// The real reporter, which the test setup stubs everywhere else. Hoisted
// anyway, but first so it reads that way.
vi.unmock("@/data/client-log")

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { preloadable } from "@/lib/preloadable"

import { forgetReports, reportError, startErrorReports } from "./client-log"
import { db } from "./db"
import { queue, saveDraft } from "./drafts"
import { sync } from "./log"
import { uploadDrafts } from "./upload"

type Report = Record<string, unknown> & { header: string | null }

// The server: /api/client-log records each report with the request id its
// call carried, and every other call gets `answer`.
function server(answer: (path: string) => Response | Promise<Response>) {
  const reports: Report[] = []
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname
    if (path === "/api/client-log") {
      reports.push({
        ...(JSON.parse(String(init?.body)) as Record<string, unknown>),
        header: new Headers(init?.headers).get("X-Request-Id"),
      })
      return new Response(null, { status: 204 })
    }
    return answer(path)
  })
  vi.stubGlobal("fetch", fetch)
  return { reports, fetch }
}

const failed = (status: number, requestId: string, body: unknown = {}) =>
  Response.json(body, { status, headers: { "X-Request-Id": requestId } })

beforeAll(() => startErrorReports())
beforeEach(() => {
  forgetReports()
  vi.spyOn(console, "debug").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  const reopen = { disableAutoOpen: false }
  await Promise.all([db.delete(reopen), queue.delete(reopen)])
})

describe("the app's error reports", () => {
  it("reports a failed sync with the failed call's request id", async () => {
    // The retry a failed sync schedules mustn't run into the next test.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const { reports } = server(() =>
      failed(500, "a1b2c3d4-0000-4000-8000-000000000001")
    )
    await sync()
    await vi.waitFor(() => expect(reports).toHaveLength(1))
    expect(reports[0]).toMatchObject({
      kind: "sync",
      message: "The log request failed: 500",
      requestId: "a1b2c3d4-0000-4000-8000-000000000001",
      route: "/",
      version: "dev",
      stack: expect.any(String),
    })
    // The report is a call of its own, with its own id.
    expect(reports[0].header).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("doesn't report a sync that got no answer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const { reports, fetch } = server(() => {
      throw new TypeError("Failed to fetch")
    })
    await sync()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(reports).toEqual([])
  })

  it("reports a refused draft without the reason, which can name a site", async () => {
    await saveDraft(
      "dive-new",
      {
        startTime: "2026-10-20T09:00:00",
        siteId: "site-a",
        duration: 2700,
        maxDepth: 18.4,
      },
      [],
      queue
    )
    const { reports } = server(() =>
      failed(422, "a1b2c3d4-0000-4000-8000-000000000002", {
        error: "There is already a site called Aliwal Shoal",
      })
    )
    await uploadDrafts()
    await vi.waitFor(() => expect(reports).toHaveLength(1))
    expect(reports[0]).toMatchObject({
      kind: "rejected",
      message: "The server refused draft dive-new (422)",
      requestId: "a1b2c3d4-0000-4000-8000-000000000002",
    })
    expect(JSON.stringify(reports)).not.toContain("Aliwal")
  })

  it("reports a lazy chunk that failed to load", async () => {
    const { reports } = server(() => new Response(null, { status: 404 }))
    const { preload } = preloadable(() =>
      Promise.reject(
        new TypeError("Failed to fetch dynamically imported module: /x.js")
      )
    )
    await expect(preload()).rejects.toThrow()
    await vi.waitFor(() => expect(reports).toHaveLength(1))
    expect(reports[0]).toMatchObject({ kind: "chunk" })
  })

  it("reports an error and a rejection nothing else caught", async () => {
    const { reports } = server(() => new Response(null, { status: 404 }))
    window.dispatchEvent(
      new ErrorEvent("error", { error: new Error("Cannot read x") })
    )
    window.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), {
        reason: new Error("Quota exceeded"),
      })
    )
    await vi.waitFor(() => expect(reports).toHaveLength(2))
    expect(reports.map(({ kind, message }) => ({ kind, message }))).toEqual([
      { kind: "error", message: "Cannot read x" },
      { kind: "rejection", message: "Quota exceeded" },
    ])
  })

  it("sends the same error once a minute", async () => {
    const { reports } = server(() => new Response(null, { status: 404 }))
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000)
    await reportError("error", new Error("Same"))
    await reportError("error", new Error("Same"))
    await reportError("error", new Error("Other"))
    now.mockReturnValue(1_000_000 + 60_000)
    await reportError("error", new Error("Same"))
    expect(reports.map((report) => report.message)).toEqual([
      "Same",
      "Other",
      "Same",
    ])
  })

  it("drops a report it can't send, and sends nothing offline", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    })
    vi.stubGlobal("fetch", fetch)
    await expect(
      reportError("error", new Error("Lost"))
    ).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(1)

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    await reportError("error", new Error("Offline"))
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
