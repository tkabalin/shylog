import { beforeEach, describe, expect, it, vi } from "vitest"

import { saveEdit, unreachable } from "./edits"
import { currentLog, sync } from "./log"

vi.mock("./log", () => ({
  sync: vi.fn(async () => {}),
  currentLog: vi.fn(() => ({ version: "v2" })),
}))

beforeEach(() => {
  vi.mocked(sync).mockClear()
  vi.mocked(currentLog).mockReturnValue({ version: "v2" } as never)
})

const edit = { fields: { notes: "Two turtles" }, adopt: ["maxDepth" as const] }

describe("saveEdit", () => {
  it("sends only the changes, then syncs", async () => {
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(new URL(String(input)).pathname).toBe("/api/dives/dive-a")
        expect(init?.method).toBe("PATCH")
        expect(new Headers(init?.headers).get("X-Shylog")).toBe("1")
        expect(JSON.parse(String(init?.body))).toEqual(edit)
        return Response.json({ version: "v2" })
      }
    )
    await saveEdit("dive-a", edit, fetch)
    expect(sync).toHaveBeenCalledOnce()
  })

  it("syncs again when a sync under way missed the edit", async () => {
    vi.mocked(currentLog).mockReturnValueOnce({ version: "v1" } as never)
    await saveEdit("dive-a", edit, async () => Response.json({ version: "v2" }))
    expect(sync).toHaveBeenCalledTimes(2)
  })

  it("throws the server's reason for a refused edit", async () => {
    const fetch = async () =>
      Response.json(
        { error: "Deeper than the maximum depth", path: ["averageDepth"] },
        { status: 400 }
      )
    await expect(saveEdit("dive-a", edit, fetch)).rejects.toThrow(
      "Deeper than the maximum depth"
    )
    expect(sync).not.toHaveBeenCalled()
  })

  it("asks to check the connection when the server can't be reached", async () => {
    const offline = async (): Promise<Response> => {
      throw new TypeError("Failed to fetch")
    }
    await expect(saveEdit("dive-a", edit, offline)).rejects.toThrow(unreachable)
    // Tailscale Serve's answer for a server that is down.
    const down = async () => new Response("Bad Gateway", { status: 502 })
    await expect(saveEdit("dive-a", edit, down)).rejects.toThrow(unreachable)
    expect(sync).not.toHaveBeenCalled()
  })
})
