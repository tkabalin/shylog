import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { restoreDive } from "@/data/edits"

import { restore } from "./restore"

vi.mock("sonner", () => ({ toast: vi.fn() }))
vi.mock("@/data/edits", () => ({ restoreDive: vi.fn(async () => {}) }))

beforeEach(() => vi.mocked(toast).mockClear())

describe("restore", () => {
  it("says the dive is back, with a View link where one is given", async () => {
    const view = vi.fn()
    expect(await restore("dive-a", "Sodwana", view)).toBe(true)
    expect(toast).toHaveBeenCalledWith("Sodwana is back in your log", {
      action: { label: "View", onClick: view },
    })
  })

  it("says why when the restore fails, and stays put", async () => {
    vi.mocked(restoreDive).mockRejectedValueOnce(
      new Error("Couldn’t reach Shylog. Check your connection.")
    )
    expect(await restore("dive-a", undefined)).toBe(false)
    expect(toast).toHaveBeenCalledWith(
      "Couldn’t reach Shylog. Check your connection."
    )
  })
})
