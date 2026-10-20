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

// Runs `change` in one transaction with its journal entries, and gives the
// commit a new random version id, so a restore can never bring back a
// version a client has already seen.
export function write<T>(
  db: Db,
  change: (journal: (entry: Entry) => void) => T
): T {
  return db.transaction(() => {
    const result = change((entry) => {
      // Prepared on first use: the first migration creates the table.
      prepared(
        db,
        "INSERT INTO ops (op_id, type, payload, applied_at) VALUES (?, ?, ?, ?)"
      ).run(
        entry.opId ?? null,
        entry.type,
        JSON.stringify(entry.payload),
        new Date().toISOString()
      )
    })
    setMeta(db, "version", randomUUID())
    return result
  })()
}
