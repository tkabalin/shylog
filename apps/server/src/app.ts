import { HTTPException } from "hono/http-exception"

import { Rejected } from "./apply/rejected.ts"
import { factory, type Deps } from "./factory.ts"
import { dives } from "./routes/dives.ts"
import { entities } from "./routes/entities.ts"
import { health } from "./routes/health.ts"
import { log } from "./routes/log.ts"
import { ops } from "./routes/ops.ts"
import { samples } from "./routes/samples.ts"
import { version } from "./routes/version.ts"
import { readOnly, security } from "./security.ts"
import { web } from "./static.ts"

export function createApp(deps: Deps) {
  return (
    factory
      .createApp()
      .use(async (c, next) => {
        c.set("deps", deps)
        await next()
      })
      .use("/api/*", security(deps.env))
      // A failed integrity check stops every write until a restore.
      .use("/api/*", async (c, next) => {
        if (deps.state.integrity === "failed" && !readOnly.has(c.req.method)) {
          return c.json(
            { error: "Saving is paused: the database failed its check" },
            503
          )
        }
        await next()
      })
      .route("/api", version)
      .route("/api", log)
      .route("/api", samples)
      .route("/api", ops)
      .route("/api", dives)
      .route("/api", entities)
      .route("/api", health)
      .route("/", web(deps.webRoot, deps.env.SHYLOG_APP_NAME))
      // A refused write has rolled back; the reason goes to the draft's
      // card or the form.
      .onError((error, c) => {
        if (error instanceof Rejected) {
          return c.json(
            { ...error.details, error: error.message, path: error.path },
            error.status
          )
        }
        // Hono's own, such as a malformed JSON body, carry their response.
        if (error instanceof HTTPException) return error.getResponse()
        // As Hono's default does: a rethrow reaches the Node adapter, which
        // answers an empty 500 and logs nothing.
        console.error(error)
        return c.text("Internal Server Error", 500)
      })
  )
}

export type AppType = ReturnType<typeof createApp>
