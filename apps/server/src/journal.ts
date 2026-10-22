import { randomUUID } from "node:crypto"

import type { Db } from "./db/open.ts"
import { prepared } from "./db/prepared.ts"

export interface Entry {
  type: string
  payload: unknown
  // The client's op id, for draft uploads; recorded so a resend is skipped.
  opId?: string
}

export function setMeta(db: Db, key: string, value: string | null) {
  prepared(
    db,
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value"
  ).run(key, value)
}

export function getMeta(db: Db, key: string): string | null {
  return (
    (prepared(db, "SELECT value FROM meta WHERE key = ?").pluck().get(key) as
      string | null | undefined) ?? null
  )
}

export const currentVersion = (db: Db) => getMeta(db, "version")

// Strictly increasing, so a transaction's entries share a time no other
// transaction has, which is how a replay groups them back together.
let lastCommit = 0
function commitTime() {
  lastCommit = Math.max(Date.now(), lastCommit + 1)
  return new Date(lastCommit)
}

// Runs `change` in one transaction with its journal entries, and gives the
// commit a new random version id, so a restore can never bring back a
// version a client has already seen. A change that journals nothing wrote
// nothing, so a repeated delete or edit keeps the version clients hold.
// The change gets the time its entries record, so a replay can reproduce
// any time it stores.
export function write<T>(
  db: Db,
  change: (journal: (entry: Entry) => void, now: Date) => T
): T {
  return db.transaction(() => {
    let changed = false
    const now = commitTime()
    const result = change((entry) => {
      // Prepared on first use: the first migration creates the table.
      changed = true
      prepared(
        db,
        "INSERT INTO ops (op_id, type, payload, applied_at) VALUES (?, ?, ?, ?)"
      ).run(
        entry.opId ?? null,
        entry.type,
        JSON.stringify(entry.payload),
        now.toISOString()
      )
    }, now)
    if (changed) setMeta(db, "version", randomUUID())
    return result
  })()
}
