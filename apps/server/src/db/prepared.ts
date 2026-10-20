import type { Statement } from "better-sqlite3"

import type { Db } from "./open.ts"

const cache = new WeakMap<Db, Map<string, Statement>>()

// better-sqlite3 parses the SQL again on every prepare, and the derived pass
// runs after every write, so each statement is prepared once per connection.
export function prepared<P extends unknown[] | object = unknown[], R = unknown>(
  db: Db,
  sql: string
): Statement<P, R> {
  let statements = cache.get(db)
  if (!statements) cache.set(db, (statements = new Map()))
  let statement = statements.get(sql)
  if (!statement) statements.set(sql, (statement = db.prepare(sql)))
  // pluck() sticks to a statement, and callers share it.
  if (statement.reader) statement.pluck(false)
  return statement as Statement<P, R>
}
