import type { Packing } from "@shylog/core"
import { afterEach, describe, expect, it, vi } from "vitest"

const list: Packing = {
  sections: [
    {
      id: "section-gear",
      name: "Gear",
      items: [
        { id: "item-mask", name: "Mask" },
        { id: "item-fins", name: "Fins" },
      ],
    },
    {
      id: "section-after",
      name: "After",
      items: [{ id: "item-towel", name: "Towel" }],
    },
  ],
}

afterEach(() => {
  localStorage.clear()
  vi.resetModules()
})

// A fresh module each time, as a reload reads the ticks again.
const load = () => import("./packing")

describe("packing ticks", () => {
  it("survive a reload", async () => {
    const first = await load()
    first.toggleTick("item-mask")
    first.toggleTick("item-towel")
    vi.resetModules()
    const again = await load()
    expect([...again.readTicks()].sort()).toEqual(["item-mask", "item-towel"])
    expect(again.packedCount(list, again.readTicks())).toBe(2)
  })

  it("untick on a second tap", async () => {
    const { toggleTick, readTicks } = await load()
    toggleTick("item-mask")
    toggleTick("item-mask")
    expect(readTicks().size).toBe(0)
  })

  it("clear with Reset, which Undo puts back", async () => {
    const { toggleTick, resetTicks, restoreTicks, readTicks } = await load()
    toggleTick("item-mask")
    const cleared = resetTicks()
    expect(readTicks().size).toBe(0)
    toggleTick("item-fins")
    restoreTicks(cleared, list)
    expect([...readTicks()].sort()).toEqual(["item-fins", "item-mask"])
  })

  it("leave out of Undo an item deleted since Reset", async () => {
    const { toggleTick, resetTicks, restoreTicks, readTicks } = await load()
    toggleTick("item-mask")
    toggleTick("item-towel")
    const cleared = resetTicks()
    restoreTicks(cleared, { sections: [list.sections[1]] })
    expect([...readTicks()]).toEqual(["item-towel"])
  })

  it("lose a deleted item's tick", async () => {
    const { toggleTick, pruneTicks, readTicks, packedCount } = await load()
    toggleTick("item-mask")
    toggleTick("item-fins")
    const fewer: Packing = {
      sections: [{ ...list.sections[0], items: [list.sections[0].items[1]] }],
    }
    expect(packedCount(fewer, readTicks())).toBe(1)
    pruneTicks(fewer)
    expect([...readTicks()]).toEqual(["item-fins"])
  })

  it("start empty when storage holds something else", async () => {
    localStorage.setItem("packing-ticks", "{oops")
    const { readTicks } = await load()
    expect(readTicks().size).toBe(0)
  })
})
