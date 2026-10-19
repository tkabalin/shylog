import { factory } from "../factory.ts"
import { currentVersion } from "../journal.ts"

export const version = factory.createApp().get("/version", (c) =>
  c.json({
    version: currentVersion(c.var.deps.db),
    serverTime: new Date().toISOString(),
  })
)
