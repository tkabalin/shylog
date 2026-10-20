import { uploadDraftRequest } from "@shylog/core"

import { applyDraft } from "../apply/draft.ts"
import { factory } from "../factory.ts"
import { currentVersion } from "../journal.ts"
import { json } from "../validate.ts"

export const ops = factory
  .createApp()
  .post("/ops", json(uploadDraftRequest), (c) => {
    const { db } = c.var.deps
    const result = applyDraft(db, c.req.valid("json").ops)
    // Sent only after the commit, so an accepted draft is never lost.
    return c.json({
      result,
      version: currentVersion(db)!,
      serverTime: new Date().toISOString(),
    })
  })
