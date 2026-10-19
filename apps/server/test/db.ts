import { migrate } from "../src/db/migrate.ts"
import { openDatabase } from "../src/db/open.ts"

// A migrated in-memory database. A new database takes no snapshot, so the
// data directory is never touched.
export function testDb() {
  const db = openDatabase(":memory:")
  migrate(db, "/nonexistent")
  return db
}
