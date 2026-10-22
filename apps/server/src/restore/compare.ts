import type { Db } from "../db/open.ts"

// Set on every commit or by the backup jobs outside the journal, so a
// replay can't and shouldn't reproduce them.
const unreplayedMeta = new Set([
  "version",
  "last_snapshot_at",
  "last_export_at",
])

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`

// Rows in a fixed order, streamed, so no table is held in memory whole.
function* rows(db: Db, table: string) {
  const all = `SELECT * FROM ${quote(table)}`
  const order = db
    .prepare(all)
    .columns()
    .map((_, i) => i + 1)
    .join(", ")
  const iterator = db.prepare(`${all} ORDER BY ${order}`).raw().iterate()
  for (const row of iterator as Iterable<unknown[]>) {
    if (table === "meta" && unreplayedMeta.has(row[0] as string)) continue
    yield JSON.stringify(row)
  }
}

const schema = (db: Db) =>
  db
    .prepare("SELECT type, name, sql FROM sqlite_schema ORDER BY type, name")
    .raw()
    .all()
    .map((row) => JSON.stringify(row))

// Every table compared row for row in a fixed order, with the schema.
// Returns one line per difference; none means the two hold the same data.
export function compare(restored: Db, live: Db): string[] {
  const differences: string[] = []
  const [a, b] = [schema(restored), schema(live)]
  const missing = b.filter((row) => !a.includes(row)).length
  const extra = a.filter((row) => !b.includes(row)).length
  if (missing || extra) {
    differences.push(
      `schema: ${extra} objects only in the restored copy, ${missing} only in the live database`
    )
    return differences
  }
  const tables = restored
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name"
    )
    .pluck()
    .all() as string[]
  for (const table of tables) {
    const left = rows(restored, table)
    const right = rows(live, table)
    let counts = [0, 0]
    let same = true
    for (;;) {
      const [a, b] = [left.next(), right.next()]
      if (a.done && b.done) break
      counts = [counts[0] + Number(!a.done), counts[1] + Number(!b.done)]
      if (a.value !== b.value) same = false
    }
    if (!same) {
      differences.push(
        `${table} differs: ${counts[0]} rows in the restored copy, ${counts[1]} in the live database`
      )
    }
  }
  return differences
}
