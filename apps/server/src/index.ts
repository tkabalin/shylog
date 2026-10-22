import { serve } from "@hono/node-server"

import { parseEnv } from "./env.ts"
import { checkIntegrity } from "./integrity.ts"
import { nightly, scheduleNightly } from "./jobs/nightly.ts"
import { boot } from "./server.ts"

const env = parseEnv(process.env)
const { app, db, state } = boot(env)

// Daily as well as at startup. Once failed, writes stay paused until a
// restore, even if a later check passes.
setInterval(
  () => {
    if (checkIntegrity(db) === "failed") state.integrity = "failed"
  },
  24 * 60 * 60 * 1000
)

// A damaged database is not snapshotted, so the newest snapshot stays a good
// one, nothing is pruned, and Settings shows the backup has stalled.
scheduleNightly((at) => {
  if (state.integrity === "failed") {
    console.error("Nightly snapshot skipped: the database failed its check")
  } else void nightly(db, env.SHYLOG_DATA_DIR, at)
})

// Loopback only: the Tailscale sidecar shares this network namespace and is
// the one way in.
serve({ fetch: app.fetch, hostname: "127.0.0.1", port: env.PORT }, (info) => {
  console.log(`Listening on http://${info.address}:${info.port}`)
})
