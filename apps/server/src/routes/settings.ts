import { putSettingsRequest } from "@shylog/core"

import { putSettings, readSettings } from "../apply/settings.ts"
import { factory } from "../factory.ts"
import { json } from "../validate.ts"
import { change } from "./change.ts"

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
