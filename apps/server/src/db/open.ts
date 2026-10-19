import Database from "better-sqlite3"

export type Db = Database.Database

// The spec's pragmas. Foreign keys are checked on every statement, never
// deferred, and SQLite's automatic checkpoints stay on.
export function openDatabase(file: string): Db {
  const db = new Database(file)
  db.pragma("journal_mode = WAL")
  db.pragma("synchronous = FULL")
  db.pragma("foreign_keys = ON")
  db.pragma("busy_timeout = 5000")
  return db
}
