import { latestSchemaVersion } from "@shylog/core"
import { act, createElement, Fragment, StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { toast } from "sonner"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useOnForm } from "@/components/app-nav"
import { LogDb } from "@/data/db"
import { QueueDb, saveDraft, useQueueCounts } from "@/data/drafts"
import { useLog } from "@/data/log"
import { syncLog } from "@/data/sync"
import { uploadDrafts } from "@/data/upload"
import { useUpdateReady } from "@/pwa"

import { updateOffer, UpdateToast, useHoldUpdate } from "./update"

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { dismiss: vi.fn() }),
}))
vi.mock("@/pwa", () => ({ useUpdateReady: vi.fn(), reloadApp: vi.fn() }))
vi.mock("@/components/app-nav", () => ({ useOnForm: vi.fn(() => false) }))
// The queue's own counts, which the real hook reads live from IndexedDB.
vi.mock("@/data/drafts", async (original) => ({
  ...(await original<typeof import("@/data/drafts")>()),
  useQueueCounts: vi.fn(),
}))
// upload.ts reads ./log too, but a blocked queue never gets that far.
vi.mock("@/data/log", () => ({
  useLog: vi.fn(),
  loadLog: vi.fn(),
  noteReached: vi.fn(),
  noteUnreachable: vi.fn(),
  retryDelay: vi.fn(() => 60_000),
}))
vi.mock("@/data/samples", () => ({ pruneProfiles: vi.fn() }))
vi.mock("@/data/cards", () => ({ pruneCardImages: vi.fn() }))

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Typed as the route matches narrow it, which a test needs to set freely.
const onForm = vi.mocked(useOnForm as () => boolean)

const offer = (over: Partial<Parameters<typeof updateOffer>[0]> = {}) =>
  updateOffer({
    blocked: false,
    hasLog: true,
    ready: true,
    waiting: 0,
    held: false,
    ...over,
  })

describe("updateOffer", () => {
  it("waits while a draft is still to upload", () => {
    expect(offer({ waiting: 1 })).toBeUndefined()
  })

  it("offers once the queue has synced, or holds only refused drafts", () => {
    // Refused drafts aren't counted as waiting (see syncStatus).
    expect(offer({ waiting: 0 })).toBe("ready")
  })

  it("makes no offer with no new version", () => {
    expect(offer({ ready: false })).toBeUndefined()
  })

  it("offers at once when a newer server has paused syncing", () => {
    expect(offer({ blocked: true, ready: false, waiting: 3 })).toBe("paused")
  })

  it("leaves a paused offer to the Log's screen with no log yet", () => {
    expect(offer({ blocked: true, hasLog: false })).toBeUndefined()
  })

  it("holds back over a form", () => {
    expect(offer({ held: true })).toBeUndefined()
    expect(offer({ blocked: true, held: true })).toBeUndefined()
  })
})

describe("a newer schemaVersion", () => {
  const db = new LogDb("update-test")
  const queue = new QueueDb("update-test-queue")
  afterEach(async () => {
    await Promise.all([db.delete(), queue.delete()])
    vi.unstubAllGlobals()
  })

  it("stops syncing, keeps the queue, and offers to update", async () => {
    await saveDraft(
      "dive-waiting",
      {
        startTime: "2026-11-09T09:00:00",
        siteId: "site-a",
        duration: 2700,
        maxDepth: 18.4,
      },
      [],
      queue
    )
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/log"))
        return Response.json({
          schemaVersion: latestSchemaVersion + 1,
          version: "v9",
        })
      throw new Error(`Not expected: ${String(input)}`)
    })

    expect(await syncLog({ db, fetch })).toBe("blocked")
    expect(await uploadDrafts({ db, queue, fetch })).toBe(false)
    // Only the log was asked for: no upload went.
    expect(fetch).toHaveBeenCalledTimes(1)
    expect((await queue.drafts.toArray()).map((d) => d.id)).toEqual([
      "dive-waiting",
    ])
    expect(await queue.ops.count()).toBe(1)
    expect(offer({ blocked: true, ready: false, waiting: 1 })).toBe("paused")
  })
})

describe("UpdateToast", () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  const shown = () => vi.mocked(toast).mock.calls

  // `queued` is the queue's count of drafts still to upload, null until
  // it is read.
  function state({
    queued = 0,
    blocked = false,
  }: { queued?: number | null; blocked?: boolean } = {}) {
    vi.mocked(useLog).mockReturnValue({ log: {}, blocked } as never)
    vi.mocked(useQueueCounts).mockReturnValue(
      queued == null ? undefined : { drafts: queued, waiting: queued }
    )
  }

  const Form = ({ dirty }: { dirty: boolean }) => {
    useHoldUpdate(dirty)
    return null
  }

  const render = (form?: boolean) =>
    act(() =>
      root.render(
        createElement(
          Fragment,
          null,
          createElement(UpdateToast),
          form == null ? null : createElement(Form, { dirty: form })
        )
      )
    )

  // Runs the take-downs and delayed showings due by then.
  const after = (ms: number) => act(() => vi.advanceTimersByTime(ms))

  // Each test a minute after the last, on a clock in the past, so no
  // test's take-down leaves the next one waiting out its exit.
  let clock = Date.UTC(2000, 0, 1)
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime((clock += 60_000))
    vi.mocked(toast).mockClear()
    vi.mocked(toast.dismiss).mockClear()
    vi.mocked(useUpdateReady).mockReturnValue(true)
    onForm.mockReturnValue(false)
    host = document.createElement("div")
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    // Past any toast's exit, so the next test starts with none on screen.
    after(1000)
    vi.useRealTimers()
  })

  it("shows once the last waiting draft has uploaded", () => {
    state({ queued: 1 })
    render()
    expect(shown()).toHaveLength(0)
    state({ queued: 0 })
    render()
    expect(shown()).toHaveLength(1)
    expect(shown()[0]![0]).toBe("A new version of Shylog is ready")
    // One line: the description is for a paused server.
    expect(shown()[0]![1]).toMatchObject({ description: undefined })
  })

  it("waits until the queue has been read", () => {
    state({ queued: null })
    render()
    expect(shown()).toHaveLength(0)
  })

  it("says syncing is paused for a newer server, drafts or not", () => {
    vi.mocked(useUpdateReady).mockReturnValue(false)
    state({ queued: 2, blocked: true })
    render()
    expect(shown()[0]![1]).toMatchObject({
      description: "Syncing is paused until you reload.",
    })
  })

  it("is taken down over the dive form and comes back after it", () => {
    state()
    onForm.mockReturnValue(true)
    render()
    expect(shown()).toHaveLength(0)
    onForm.mockReturnValue(false)
    render()
    expect(shown()).toHaveLength(1)
  })

  it("is held back while a form has unsaved edits", () => {
    state()
    render(false)
    expect(shown()).toHaveLength(1)
    render(true)
    after(0)
    const first = shown()[0]![1]!.id
    expect(toast.dismiss).toHaveBeenCalledWith(first)
    // Its own take-down isn't a swipe, so it comes back.
    shown()[0]![1]!.onDismiss!({ id: first } as never)
    render(false)
    expect(shown()).toHaveLength(2)
    // A toast of its own, so the old one's exit can't take it with it.
    expect(shown()[1]![1]!.id).not.toBe(first)
  })

  it("stays up through React's double effect, as one toast", () => {
    state()
    act(() =>
      root.render(createElement(StrictMode, null, createElement(UpdateToast)))
    )
    after(1000)
    expect(shown()).toHaveLength(1)
    expect(toast.dismiss).not.toHaveBeenCalled()
  })

  it("changes in place when a ready offer turns to paused", () => {
    state()
    render()
    state({ blocked: true })
    render()
    after(1000)
    expect(shown()).toHaveLength(2)
    expect(shown()[1]![1]).toMatchObject({
      id: shown()[0]![1]!.id,
      description: "Syncing is paused until you reload.",
    })
    expect(toast.dismiss).not.toHaveBeenCalled()
  })
})

// Last, as a swipe keeps the offer away for the rest of the launch.
describe("a swiped-away offer", () => {
  it("stays away until the next launch", () => {
    vi.mocked(toast).mockClear()
    vi.mocked(useUpdateReady).mockReturnValue(true)
    vi.mocked(useLog).mockReturnValue({ log: {}, blocked: false } as never)
    vi.mocked(useQueueCounts).mockReturnValue({ drafts: 0, waiting: 0 })
    const root = createRoot(document.createElement("div"))
    act(() => root.render(createElement(UpdateToast)))
    vi.mocked(toast).mock.calls[0]![1]!.onDismiss!({ id: "update" } as never)
    act(() => root.unmount())
    const again = createRoot(document.createElement("div"))
    act(() => again.render(createElement(UpdateToast)))
    act(() => again.unmount())
    expect(vi.mocked(toast).mock.calls).toHaveLength(1)
  })
})
