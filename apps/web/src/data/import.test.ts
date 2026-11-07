import type { ComputerDive, ImportPreview, ImportSummary } from "@shylog/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Overrides } from "@/import/review"

// The log is reduced to the dives a pairing asks about, and a sync to a
// spy; the module's state is fresh for each test.
const log = vi.hoisted(() => ({
  dives: new Map<string, { deletedAt?: string; sparkline?: unknown }>(),
}))
vi.mock("./log", () => ({
  currentLog: () => ({ dive: log.dives }),
  sync: vi.fn(async () => {}),
}))

let store: typeof import("./import")
beforeEach(async () => {
  vi.resetModules()
  sessionStorage.clear()
  log.dives = new Map([
    ["dive-1", {}],
    ["dive-2", {}],
    ["dive-3", {}],
  ])
  store = await import("./import")
})
afterEach(() => vi.restoreAllMocks())

const computer = (ref: string, startTime: string): ComputerDive => ({
  ref,
  day: startTime.slice(0, 10),
  computerStartTime: startTime,
  startTime,
  duration: 2700,
  maxDepth: 18,
  averageDepth: 11,
  minTemperature: 20,
  maxTemperature: 22,
  profile: null,
  oxygen: null,
  site: null,
  unsupportedGas: false,
})

// One hand dive paired on each of two days, and a new dive on the first.
const preview = (extra: Partial<ImportPreview> = {}): ImportPreview => ({
  id: "import-a",
  basedOnVersion: "v1",
  revision: 1,
  createdAt: "2026-11-07T10:00:00.000Z",
  expiresAt: "2026-11-14T10:00:00.000Z",
  computerModel: "Suunto D4i",
  days: [
    { date: "2026-07-25", estimatedOffset: 0, offset: 0 },
    { date: "2026-07-26", estimatedOffset: 0, offset: 0 },
  ],
  pairs: [
    { computerDive: computer("c1", "2026-07-25T09:00:00"), diveId: "dive-1" },
    { computerDive: computer("c2", "2026-07-26T09:00:00"), diveId: "dive-2" },
  ],
  newDives: [computer("c3", "2026-07-25T15:00:00")],
  unpaired: [],
  leftOut: [],
  alreadyImported: 0,
  ...extra,
})

const summary: ImportSummary = {
  paired: 2,
  added: 1,
  alreadyImported: 0,
  leftOut: 0,
  included: 0,
  differing: [],
}

const pending = (p: ImportPreview | null, lastImport: unknown = null) =>
  Response.json({ preview: p, lastImport })

// Answers each request in turn, recording what was asked.
function server(...replies: (Response | Error)[]) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    const reply = replies.shift()
    if (!reply) throw new Error("No reply left")
    if (reply instanceof Error) throw reply
    return reply
  })
  const asked = () =>
    fetch.mock.calls.map(([url, init]) => {
      const request = url instanceof Request ? url : null
      const method = request?.method ?? init?.method ?? "GET"
      return `${method} ${new URL(String(request?.url ?? url), location.origin).pathname}`
    })
  return { fetch: fetch as typeof globalThis.fetch, asked, calls: fetch.mock }
}

const skipC3: Overrides = { c3: { kind: "skip" } }

describe("loadPending", () => {
  it("takes the preview and the last import", async () => {
    const last = { at: "2026-11-01T10:00:00Z", file: null, ...summary }
    const { fetch } = server(pending(preview(), last))
    await store.loadPending(fetch)
    expect(store.currentImport()).toEqual({
      loaded: true,
      preview: preview(),
      lastImport: last,
      overrides: {},
    })
  })

  it("keeps the choices for the same revision, and drops them for another", async () => {
    const { fetch } = server(
      pending(preview()),
      pending(preview()),
      pending(preview({ revision: 2 }))
    )
    await store.loadPending(fetch)
    store.setOverrides(skipC3)
    await store.loadPending(fetch)
    expect(store.currentImport().overrides).toBe(skipC3)
    await store.loadPending(fetch)
    expect(store.currentImport().overrides).toEqual({})
  })

  it("brings back the choices a reload left in session storage", async () => {
    const { fetch } = server(pending(preview()))
    await store.loadPending(fetch)
    store.setOverrides(skipC3)
    vi.resetModules()
    const reloaded = await import("./import")
    await reloaded.loadPending(server(pending(preview())).fetch)
    expect(reloaded.currentImport().overrides).toEqual(skipC3)
    // Another revision since starts them afresh.
    vi.resetModules()
    const again = await import("./import")
    await again.loadPending(server(pending(preview({ revision: 3 }))).fetch)
    expect(again.currentImport().overrides).toEqual({})
  })

  it("forgets stored choices once no preview is waiting", async () => {
    const { fetch } = server(pending(preview()), pending(null))
    await store.loadPending(fetch)
    store.setOverrides(skipC3)
    expect(sessionStorage.length).toBe(1)
    await store.loadPending(fetch)
    expect(sessionStorage.length).toBe(0)
  })

  it("reads unreadable stored choices as none", async () => {
    sessionStorage.setItem("shylog-import-review", "{")
    await store.loadPending(server(pending(preview())).fetch)
    expect(store.currentImport().overrides).toEqual({})
  })

  it("lasts the visit when storage is turned off", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("off", "SecurityError")
    })
    await store.loadPending(server(pending(preview())).fetch)
    store.setOverrides(skipC3)
    expect(store.currentImport().overrides).toBe(skipC3)
  })

  it("takes only the last import when an upload answered meanwhile", async () => {
    let answer!: (res: Response) => void
    const slow = vi.fn(
      () => new Promise<Response>((resolve) => (answer = resolve))
    )
    const loading = store.loadPending(slow as typeof globalThis.fetch)
    const uploaded = preview({ id: "import-b" })
    await store.uploadExport(
      new File(["<uddf/>"], "dives.uddf"),
      server(Response.json(uploaded)).fetch
    )
    const last = { at: "2026-11-01T10:00:00Z", file: null, ...summary }
    answer(pending(preview(), last))
    await loading
    expect(store.currentImport().preview).toEqual(uploaded)
    expect(store.currentImport().lastImport).toEqual(last)
  })

  it("says why it failed, keeping what the phone had", async () => {
    const { fetch } = server(
      pending(preview()),
      new TypeError("Failed to fetch"),
      Response.json({ error: "Not allowed" }, { status: 403 }),
      new Response("<html>", { status: 502 }),
      new Response("", { status: 418 })
    )
    await store.loadPending(fetch)
    await expect(store.loadPending(fetch)).rejects.toThrow(
      "Couldn’t reach Shylog"
    )
    await expect(store.loadPending(fetch)).rejects.toThrow("Not allowed")
    await expect(store.loadPending(fetch)).rejects.toThrow(
      "Couldn’t reach Shylog"
    )
    await expect(store.loadPending(fetch)).rejects.toThrow(
      "Something went wrong (418)"
    )
    expect(store.currentImport().preview).toEqual(preview())
  })
})

describe("uploadExport", () => {
  it("sends a typeless file as bytes under its name", async () => {
    const { fetch, calls } = server(Response.json(preview()))
    store.setOverrides(skipC3)
    expect(
      await store.uploadExport(new File(["<uddf/>"], "Dive log é.uddf"), fetch)
    ).toEqual(preview())
    const headers = new Headers(calls.calls[0][1]!.headers)
    expect(headers.get("Content-Type")).toBe("application/octet-stream")
    expect(headers.get("Content-Disposition")).toBe(
      "attachment; filename*=UTF-8''Dive%20log%20%C3%A9.uddf"
    )
    expect(headers.get("X-Shylog")).toBe("1")
    expect(store.currentImport().overrides).toEqual({})
  })

  it("keeps an XML type, and says why the server refused the file", async () => {
    const { fetch, calls } = server(
      Response.json({ error: "Not a UDDF file" }, { status: 422 })
    )
    await expect(
      store.uploadExport(
        new File(["<x/>"], "x.xml", { type: "text/xml" }),
        fetch
      )
    ).rejects.toThrow("Not a UDDF file")
    expect(new Headers(calls.calls[0][1]!.headers).get("Content-Type")).toBe(
      "text/xml"
    )
  })
})

describe("setDayOffset", () => {
  it("takes the day proposed again, dropping the choices on it", async () => {
    const moved = preview({
      revision: 2,
      days: [
        { date: "2026-07-25", estimatedOffset: 0, offset: 600 },
        { date: "2026-07-26", estimatedOffset: 0, offset: 0 },
      ],
    })
    const { fetch, asked } = server(pending(preview()), Response.json(moved))
    await store.loadPending(fetch)
    const kept: Overrides = { c2: { kind: "skip" } }
    store.setOverrides({ ...skipC3, ...kept })
    await store.setDayOffset("2026-07-25", 600, fetch)
    expect(asked()).toEqual([
      "GET /api/import/pending",
      "PATCH /api/import/import-a",
    ])
    expect(store.currentImport().preview).toEqual(moved)
    expect(store.currentImport().overrides).toEqual(kept)
  })

  it("refuses once the preview is gone, and lets the next change through", async () => {
    await expect(store.setDayOffset("2026-07-25", 0)).rejects.toThrow(
      "This import is no longer waiting"
    )
    const { fetch } = server(
      pending(preview()),
      Response.json({ error: "Gone" }, { status: 404 }),
      Response.json(preview({ revision: 2 }))
    )
    await store.loadPending(fetch)
    await expect(store.setDayOffset("2026-07-25", 60, fetch)).rejects.toThrow(
      "Gone"
    )
    await store.setDayOffset("2026-07-25", null, fetch)
    expect(store.currentImport().preview?.revision).toBe(2)
  })

  it("ignores an answer for a preview since replaced", async () => {
    let answer!: (res: Response) => void
    await store.loadPending(server(pending(preview())).fetch)
    const slow = vi.fn(
      () => new Promise<Response>((resolve) => (answer = resolve))
    )
    const moving = store.setDayOffset(
      "2026-07-25",
      60,
      slow as typeof globalThis.fetch
    )
    await vi.waitFor(() => expect(slow).toHaveBeenCalled())
    const uploaded = preview({ id: "import-b" })
    await store.uploadExport(
      new File([""], "b.uddf"),
      server(Response.json(uploaded)).fetch
    )
    answer(Response.json(preview({ revision: 2 })))
    await moving
    expect(store.currentImport().preview).toEqual(uploaded)
  })
})

describe("discardPreview", () => {
  it("deletes the preview and its choices, and does nothing with none", async () => {
    const { fetch, asked } = server(
      pending(preview()),
      Response.json({ error: "Down" }, { status: 503 }),
      new Response(null, { status: 204 })
    )
    await store.loadPending(fetch)
    store.setOverrides(skipC3)
    await expect(store.discardPreview(fetch)).rejects.toThrow("Down")
    await store.discardPreview(fetch)
    await store.discardPreview(fetch)
    expect(asked()).toEqual([
      "GET /api/import/pending",
      "DELETE /api/import/import-a",
      "DELETE /api/import/import-a",
    ])
    expect(store.currentImport()).toMatchObject({
      preview: null,
      overrides: {},
    })
  })
})

describe("pairable", () => {
  it("takes a live hand dive with no profile", () => {
    log.dives.set("dive-4", { sparkline: [1] })
    log.dives.set("dive-5", { deletedAt: "2026-11-01T10:00:00Z" })
    expect(
      ["dive-1", "dive-4", "dive-5", "dive-9"].map(store.pairable)
    ).toEqual([true, false, false, false])
  })
})

describe("applyReview", () => {
  it("refuses with no preview waiting", async () => {
    await expect(store.applyReview()).rejects.toThrow(
      "This import is no longer waiting"
    )
  })

  it("applies, showing the summary until the server's copy arrives", async () => {
    const { sync } = await import("./log")
    const { fetch, asked, calls } = server(
      pending(preview()),
      Response.json({ status: "applied", ...summary }),
      pending(null)
    )
    await store.loadPending(fetch)
    store.setOverrides(skipC3)
    expect(await store.applyReview(fetch)).toEqual({
      status: "applied",
      summary,
    })
    expect(JSON.parse(String(calls.calls[1][1]!.body))).toMatchObject({
      revision: 1,
      add: [],
    })
    expect(store.currentImport()).toMatchObject({
      preview: null,
      overrides: {},
      lastImport: {
        ...summary,
        file: {
          dives: 3,
          from: "2026-07-25",
          to: "2026-07-26",
          computerModel: "Suunto D4i",
        },
      },
    })
    await vi.waitFor(() => expect(asked()).toHaveLength(3))
    expect(sync).toHaveBeenCalled()
  })

  it("waits for a clock change on its way before applying", async () => {
    let answer!: (res: Response) => void
    await store.loadPending(server(pending(preview())).fetch)
    const moved = preview({ revision: 2 })
    const order: string[] = []
    const fetch = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET"
      order.push(method)
      if (method === "PATCH")
        return new Promise<Response>((resolve) => (answer = resolve))
      if (method === "POST")
        return Promise.resolve(Response.json({ status: "applied", ...summary }))
      return Promise.resolve(pending(null))
    }) as unknown as typeof globalThis.fetch
    const moving = store.setDayOffset("2026-07-25", 60, fetch)
    const applying = store.applyReview(fetch)
    await vi.waitFor(() => expect(order).toEqual(["PATCH"]))
    answer(Response.json(moved))
    await Promise.all([moving, applying])
    expect(order.slice(0, 2)).toEqual(["PATCH", "POST"])
  })

  it("says what was applied when a chunk failed", async () => {
    const applied = { ...summary, added: 0, paired: 1 }
    const { fetch } = server(
      pending(preview()),
      Response.json(
        { status: "failed", error: "Disk full", applied },
        { status: 500 }
      ),
      pending(preview({ revision: 2 }))
    )
    await store.loadPending(fetch)
    const failed = await store.applyReview(fetch).catch((e: unknown) => e)
    expect(failed).toBeInstanceOf(store.AppliedSome)
    expect(failed).toMatchObject({ message: "Disk full", applied })
    expect(store.currentImport().preview?.revision).toBe(2)
  })

  it("asks again about the dives the server proposed again", async () => {
    // dive-2 was deleted meanwhile, so day 26 pairs nothing now.
    const next = preview({
      revision: 2,
      pairs: [preview().pairs[0]],
      newDives: [preview().newDives[0], computer("c2", "2026-07-26T09:00:00")],
    })
    const { fetch } = server(
      pending(preview()),
      Response.json(
        { status: "changed", diveIds: ["dive-2"] },
        { status: 409 }
      ),
      pending(next)
    )
    await store.loadPending(fetch)
    const kept: Overrides = skipC3
    store.setOverrides({ ...kept, c2: { kind: "add" } })
    expect(await store.applyReview(fetch)).toEqual({
      status: "changed",
      diveIds: ["dive-2"],
    })
    expect(store.currentImport().preview).toEqual(next)
    expect(store.currentImport().overrides).toEqual(kept)
  })

  it("shows what is there now when the preview went or a pairing broke", async () => {
    // A broken pairing proposes nothing again, so the revision stays.
    const { fetch } = server(
      pending(preview()),
      Response.json({ error: "A dive was deleted" }, { status: 409 }),
      pending(preview()),
      Response.json({ error: "Gone" }, { status: 404 }),
      pending(null),
      new TypeError("Failed to fetch")
    )
    await store.loadPending(fetch)
    store.setOverrides(skipC3)
    await expect(store.applyReview(fetch)).rejects.toThrow("A dive was deleted")
    expect(store.currentImport().overrides).toEqual(skipC3)
    await expect(store.applyReview(fetch)).rejects.toThrow("Gone")
    expect(store.currentImport().preview).toBeNull()
    await store.loadPending(server(pending(preview())).fetch)
    await expect(store.applyReview(fetch)).rejects.toThrow(
      "Couldn’t reach Shylog"
    )
  })
})
