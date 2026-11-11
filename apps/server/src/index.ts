import { serve } from "@hono/node-server"

import { parseEnv } from "./env.ts"
import { checkIntegrity } from "./integrity.ts"
import { nightly, startNightly } from "./jobs/nightly.ts"
import { configureLog, logger } from "./log.ts"
import { boot } from "./server.ts"

const env = parseEnv(process.env)
configureLog(env)
// Node still prints the crash and exits; this puts it in the log too, with
// the instance and version. stdout to a pipe is synchronous on Linux.
process.on("uncaughtExceptionMonitor", (error, origin) => {
  logger.fatal(
    { event: "crash", origin, err: error },
    error instanceof Error ? error.message : String(error)
  )
})
const { app, db, state } = boot(env, env.SHYLOG_WEB_ROOT)

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
  logger.info(
    { event: "listening", address: info.address, port: info.port },
    `Listening on http://${info.address}:${info.port}`
  )
})
