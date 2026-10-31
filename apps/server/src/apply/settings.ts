import { settingsSchema, type Settings } from "@shylog/core"

import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"

export function readSettings(db: Db): Settings {
  const row = prepared(
    db,
    "SELECT diver_name AS diverName, max_po2 AS maxPo2, new_dive_defaults AS newDiveDefaults FROM settings"
  ).get() as { diverName: string; maxPo2: number; newDiveDefaults: string }
  // A restore replays settings journalled before migration 4 removed this
  // key, onto a row that still has it.
  const newDiveDefaults = JSON.parse(row.newDiveDefaults) as Record<
    string,
    unknown
  >
  delete newDiveDefaults.visibilityMode
  return settingsSchema.parse({ ...row, newDiveDefaults })
}

// New-dive defaults are replaced whole, and stored as core's schema wrote
// them, so comparing the JSON tells a repeated save from a change.
export function putSettings(db: Db, request: Partial<Settings>): boolean {
  const before = readSettings(db)
  const after = { ...before, ...request }
  if (JSON.stringify(after) === JSON.stringify(before)) return false
  prepared(
    db,
    "UPDATE settings SET diver_name = ?, max_po2 = ?, new_dive_defaults = ?"
  ).run(after.diverName, after.maxPo2, JSON.stringify(after.newDiveDefaults))
  return true
}
