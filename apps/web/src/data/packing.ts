import { useSyncExternalStore } from "react"
import type { Packing } from "@shylog/core"

import { apiClient } from "@/api/client"
import { localValue } from "@/lib/local-value"

import { commit } from "./edits"

// The ticked items' ids, kept on this device only, as they matter for one
// packing and no further. One store, so You's row follows the screen.
const ticks = localValue<ReadonlySet<string>>(
  "packing-ticks",
  (stored) => {
    const ids = JSON.parse(stored ?? "[]") as unknown
    return new Set(Array.isArray(ids) ? ids.map(String) : [])
  },
  (ids) => JSON.stringify([...ids])
)
const store = ticks.set

export const readTicks = ticks.get

export const usePackingTicks = () =>
  useSyncExternalStore(ticks.subscribe, ticks.get)

export function toggleTick(id: string) {
  const next = new Set(ticks.get())
  if (!next.delete(id)) next.add(id)
  store(next)
}

// Every tick cleared; the ticks it cleared are returned for Undo.
export function resetTicks() {
  const cleared = ticks.get()
  store(new Set())
  return cleared
}

// Added back to any ticked since, which Undo shouldn't take away, leaving
// out items deleted in between.
export function restoreTicks(saved: ReadonlySet<string>, packing: Packing) {
  const ids = new Set<string>(itemIds(packing))
  store(new Set([...ticks.get(), ...[...saved].filter((id) => ids.has(id))]))
}

export const itemIds = (packing: Packing) =>
  packing.sections.flatMap((section) => section.items.map((item) => item.id))

// A deleted item's tick goes with it, so an id the list no longer has
// can't count, or come back ticked.
export function pruneTicks(packing: Packing) {
  const ids = new Set<string>(itemIds(packing))
  const ticked = [...ticks.get()]
  if (ticked.every((id) => ids.has(id))) return
  store(new Set(ticked.filter((id) => ids.has(id))))
}

// How many of the list's items are ticked.
export const packedCount = (packing: Packing, ticked: ReadonlySet<string>) =>
  itemIds(packing).filter((id) => ticked.has(id)).length

// `PUT /api/packing` with the whole list, as Edit's Done sends it.
export const savePacking = (packing: Packing) =>
  commit(apiClient().api.packing.$put({ json: packing }))
