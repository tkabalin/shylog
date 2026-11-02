import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { download, exportNow } from "./export"

const reply = (status: number, body: string, headers = {}) =>
  new Response(body, { status, headers })

const uddf = () =>
  reply(200, "<uddf/>", {
    "Content-Type": "application/xml; charset=utf-8",
    "Content-Disposition": 'attachment; filename="shylog-2026-11-02.uddf"',
  })

let fetch: ReturnType<typeof vi.fn>
let share: ReturnType<typeof vi.fn>
let canShare: ReturnType<typeof vi.fn>
let clicked: string[]

beforeEach(() => {
  fetch = vi.fn(async () => uddf())
  share = vi.fn(async () => {})
  canShare = vi.fn(() => true)
  clicked = []
  vi.stubGlobal("fetch", fetch)
  Object.assign(navigator, { share, canShare })
  URL.createObjectURL = vi.fn(() => "blob:file")
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    clicked.push(this.download)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("download", () => {
  it("hands a phone's file to the share sheet under the server's name", async () => {
    await download("uddf", false)
    const [{ files }] = share.mock.calls[0] as [{ files: File[] }]
    expect(files[0].name).toBe("shylog-2026-11-02.uddf")
    expect(files[0].type).toBe("application/xml")
    expect(await files[0].text()).toBe("<uddf/>")
    expect(clicked).toEqual([])
    const [url, init] = fetch.mock.calls[0] as [URL, RequestInit]
    expect(String(url)).toMatch(/\/api\/export\/uddf$/)
    expect(new Headers(init.headers).get("X-Shylog")).toBe("1")
  })

  it("downloads on a desktop, or where the file can't be shared", async () => {
    await download("uddf", true)
    canShare.mockReturnValue(false)
    await download("uddf", false)
    expect(share).not.toHaveBeenCalled()
    expect(clicked).toEqual([
      "shylog-2026-11-02.uddf",
      "shylog-2026-11-02.uddf",
    ])
  })

  it("takes a closed sheet as a choice, and downloads when it can't open", async () => {
    share.mockRejectedValueOnce(new DOMException("closed", "AbortError"))
    await download("uddf", false)
    expect(clicked).toEqual([])
    share.mockRejectedValueOnce(new DOMException("late", "NotAllowedError"))
    await download("uddf", false)
    expect(clicked).toEqual(["shylog-2026-11-02.uddf"])
  })

  it("says why the server gave no file", async () => {
    fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    await expect(download("snapshot", false)).rejects.toThrow(
      "Couldn’t reach Shylog. Check your connection."
    )
    fetch.mockResolvedValueOnce(reply(502, ""))
    await expect(download("uddf", false)).rejects.toThrow(
      "Couldn’t reach Shylog. Check your connection."
    )
    fetch.mockResolvedValueOnce(
      reply(503, JSON.stringify({ error: "The database failed its check" }))
    )
    await expect(download("uddf", false)).rejects.toThrow(
      "The database failed its check"
    )
    fetch.mockResolvedValueOnce(reply(500, "Internal Server Error"))
    await expect(download("snapshot", false)).rejects.toThrow(
      "The server couldn’t make it. Its log says why."
    )
    expect(share).not.toHaveBeenCalled()
  })
})

describe("exportNow", () => {
  it("posts and says why it failed", async () => {
    fetch.mockResolvedValueOnce(
      reply(200, JSON.stringify({ lastExportAt: "2026-11-02T12:00:00.000Z" }))
    )
    expect(await exportNow()).toBe("2026-11-02T12:00:00.000Z")
    const [url, init] = fetch.mock.calls[0] as [URL, RequestInit]
    expect(String(url)).toMatch(/\/api\/export\/run$/)
    expect(init.method).toBe("POST")
    fetch.mockResolvedValueOnce(reply(500, ""))
    await expect(exportNow()).rejects.toThrow(
      "Export now failed too. It’ll run again tonight, and the server’s log says why."
    )
  })
})
