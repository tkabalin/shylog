import { patchDiveRequest } from "@shylog/core"

import { setDeleted } from "../apply/dive.ts"
import { applyDiveEdit } from "../edits.ts"
import { factory } from "../factory.ts"
import { json } from "../validate.ts"
import { change, changeBy } from "./change.ts"

export const dives = factory
  .createApp()
  .patch("/dives/:id", json(patchDiveRequest), (c) => {
    const { db } = c.var.deps
    const diveId = c.req.param("id")
    const request = c.req.valid("json")
    return c.json(
      changeBy(db, (journal) => applyDiveEdit(db, journal, diveId, request))
    )
  })
  .delete("/dives/:id", (c) => {
    const { db } = c.var.deps
    const diveId = c.req.param("id")
    return c.json(
      change(db, (now) => setDeleted(db, diveId, true, now), {
        type: "deleteDive",
        payload: { diveId },
      })
    )
  })
  .post("/dives/:id/restore", (c) => {
    const { db } = c.var.deps
    const diveId = c.req.param("id")
    return c.json(
      change(db, (now) => setDeleted(db, diveId, false, now), {
        type: "restoreDive",
        payload: { diveId },
      })
    )
  })
