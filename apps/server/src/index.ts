import { serve } from "@hono/node-server"

import { parseEnv } from "./env.ts"
import { checkIntegrity } from "./integrity.ts"
import { nightly, startNightly } from "./jobs/nightly.ts"
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

startNightly(env.SHYLOG_DATA_DIR, (at) => {
  void nightly(db, env.SHYLOG_DATA_DIR, state.integrity, at)
})

// Loopback only: the Tailscale sidecar shares this network namespace and is
// the one way in.
serve({ fetch: app.fetch, hostname: "127.0.0.1", port: env.PORT }, (info) => {
  console.log(`Listening on http://${info.address}:${info.port}`)
})
