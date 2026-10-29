import { useSyncExternalStore } from "react"

import { db as defaultDb, type LogDb, type Synced } from "./db"

// When a sync last reached the server, for the You tab's "Last sync". A
// store of its own, so the five-minute check doesn't re-render every
// screen that reads the log.
let at: string | undefined
const listeners = new Set<() => void>()

function set(next: string) {
  at = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export const useLastSync = () => useSyncExternalStore(subscribe, () => at)

// The time kept from an earlier launch, unless this one has synced since.
export async function readLastSync(db: LogDb = defaultDb) {
  const row = (await db.meta.get("synced")) as Synced | undefined
  if (row && (!at || row.at > at)) set(row.at)
}

// Kept in the mirror, so it survives the app closing; memory keeps it even
// if storage refuses the write.
export async function noteSynced(db: LogDb = defaultDb) {
  const now = new Date().toISOString()
  set(now)
  await db.meta.put({ key: "synced", at: now }).catch(() => {})
}

// The same outside React, for tests.
export const lastSync = () => at
