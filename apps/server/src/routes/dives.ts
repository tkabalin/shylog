import { patchDiveRequest } from "@shylog/core"

import { editDive, setDeleted } from "../apply/dive.ts"
import type { Db } from "../db/open.ts"
import { recalculate } from "../derived.ts"
import { factory } from "../factory.ts"
import { currentVersion, write, type Entry } from "../journal.ts"
import { json } from "../validate.ts"

// Edits to synced dives. Each is one journalled transaction followed by the
// derived pass, and one that changes nothing writes nothing.
function change(db: Db, apply: () => boolean, entry: Entry) {
  write(db, (journal) => {
    if (!apply()) return
    recalculate(db)
    journal(entry)
  })
  return { version: currentVersion(db)! }
}

export const dives = factory
  .createApp()
  .patch("/dives/:id", json(patchDiveRequest), (c) => {
    const { db } = c.var.deps
    const diveId = c.req.param("id")
    const request = c.req.valid("json")
    return c.json(
      change(db, () => editDive(db, diveId, request), {
        type: "editDive",
        payload: { diveId, ...request },
      })
    )
  })
  .delete("/dives/:id", (c) => {
    const { db } = c.var.deps
    const diveId = c.req.param("id")
    return c.json(
      change(db, () => setDeleted(db, diveId, true), {
        type: "deleteDive",
        payload: { diveId },
      })
    )
  })
  .post("/dives/:id/restore", (c) => {
    const { db } = c.var.deps
    const diveId = c.req.param("id")
    return c.json(
      change(db, () => setDeleted(db, diveId, false), {
        type: "restoreDive",
        payload: { diveId },
      })
    )
  })
