import { mkdirSync } from "node:fs"
import { join } from "node:path"

import { getMeta, setMeta, write } from "../journal.ts"
import { initial } from "./migrations/001-initial.ts"
import { tombstonesCardHashes } from "./migrations/002-tombstones-card-hashes.ts"
import type { Db } from "./open.ts"

export interface Migration {
  version: number
  name: string
  up(db: Db): void
}

export const migrations: Migration[] = [initial, tombstonesCardHashes]

export function schemaVersion(db: Db): number {
  const hasMeta = db
    .prepare(
      "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'meta'"
    )
    .get()
  if (!hasMeta) return 0
  return Number(getMeta(db, "schema_version") ?? 0)
}

// Brings the schema up to date, each migration preceded by a snapshot (not
// for a new, empty database) and run in its own journalled transaction that a
// failing foreign_key_check rolls back. Foreign keys are off meanwhile, as
// SQLite's table rebuilds need, so that check is the guard.
export function migrate(db: Db, dataDir: string, list = migrations) {
  const from = schemaVersion(db)
  // Older code on a newer schema would write rows it doesn't understand.
  const latest = list.at(-1)?.version ?? 0
  if (from > latest) {
    throw new Error(
      `The database is at schema ${from}, newer than this server's ${latest}`
    )
  }
  const pending = list.filter((migration) => migration.version > from)
  if (!pending.length) return

  // Decided once, as the first migration leaves a new database non-empty.
  const empty = !db.prepare("SELECT 1 FROM sqlite_schema LIMIT 1").get()
  db.pragma("foreign_keys = OFF")
  try {
    for (const migration of pending) {
      if (!empty) snapshot(db, dataDir, migration.version)
      runMigration(db, migration)
    }
  } finally {
    db.pragma("foreign_keys = ON")
  }
}

function snapshot(db: Db, dataDir: string, version: number) {
  const dir = join(dataDir, "snapshots")
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  db.prepare("VACUUM INTO ?").run(
    join(dir, `pre-migration-${version}-${stamp}.db`)
  )
}

function runMigration(db: Db, migration: Migration) {
  write(db, (journal) => {
    migration.up(db)
    setMeta(db, "schema_version", String(migration.version))
    journal({
      type: "migration",
      payload: { version: migration.version, name: migration.name },
    })
    const problems = db.pragma("foreign_key_check") as unknown[]
    if (problems.length) {
      throw new Error(
        `Migration ${migration.version} broke foreign keys: ${JSON.stringify(problems)}`
      )
    }
  })
}
