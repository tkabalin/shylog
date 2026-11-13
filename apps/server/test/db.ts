import Database from "better-sqlite3"

import { migrate } from "../src/db/migrate.ts"
import { openDatabase, type Db } from "../src/db/open.ts"

// A migrated in-memory database. A new database takes no snapshot, so the
// data directory is never touched.
export function testDb() {
  const db = openDatabase(":memory:")
  migrate(db, "/nonexistent")
  return db
}

// An in-memory copy, as a nightly snapshot would hold.
export function copyOf(db: Db) {
  const copy = new Database(db.serialize())
  copy.pragma("foreign_keys = ON")
  return copy
}
