import { serve } from "@hono/node-server"

import { app } from "./app.ts"
import { parseEnv } from "./env.ts"

const env = parseEnv(process.env)

// Loopback only: the Tailscale sidecar shares this network namespace and is
// the one way in.
serve({ fetch: app.fetch, hostname: "127.0.0.1", port: env.PORT }, (info) => {
  console.log(`Listening on http://${info.address}:${info.port}`)
})
