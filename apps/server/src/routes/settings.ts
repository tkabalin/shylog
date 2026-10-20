import { putSettingsRequest, settingsSchema, type Settings } from "@shylog/core"

import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"
import { factory } from "../factory.ts"
import { json } from "../validate.ts"
import { change } from "./change.ts"

export function readSettings(db: Db): Settings {
  const row = prepared(
    db,
    "SELECT diver_name AS diverName, max_po2 AS maxPo2, new_dive_defaults AS newDiveDefaults FROM settings"
  ).get() as { diverName: string; maxPo2: number; newDiveDefaults: string }
  return settingsSchema.parse({
    ...row,
    newDiveDefaults: JSON.parse(row.newDiveDefaults),
  })
}

// New-dive defaults are replaced whole, and stored as core's schema wrote
// them, so comparing the JSON tells a repeated save from a change.
function putSettings(db: Db, request: Partial<Settings>): boolean {
  const before = readSettings(db)
  const after = { ...before, ...request }
  if (JSON.stringify(after) === JSON.stringify(before)) return false
  prepared(
    db,
    "UPDATE settings SET diver_name = ?, max_po2 = ?, new_dive_defaults = ?"
  ).run(after.diverName, after.maxPo2, JSON.stringify(after.newDiveDefaults))
  return true
}

export const settings = factory
  .createApp()
  .get("/settings", (c) => c.json(readSettings(c.var.deps.db)))
  .put("/settings", json(putSettingsRequest), (c) => {
    const { db } = c.var.deps
    const request = c.req.valid("json")
    return c.json(
      change(
        db,
        () => putSettings(db, request),
        { type: "putSettings", payload: request },
        false
      )
    )
  })
