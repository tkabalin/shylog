import { factory, type Deps } from "./factory.ts"
import { health } from "./routes/health.ts"
import { log } from "./routes/log.ts"
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
      .route("/api", health)
      .route("/", web(deps.webRoot, deps.env.SHYLOG_APP_NAME))
  )
}

export type AppType = ReturnType<typeof createApp>
