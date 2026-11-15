import { bodyLimit } from "hono/body-limit"
import { compress } from "hono/compress"
import { HTTPException } from "hono/http-exception"

import { Rejected } from "./apply/rejected.ts"
import { factory, type Deps } from "./factory.ts"
import { savingPaused } from "./integrity.ts"
import { logger } from "./log.ts"
import { mcp } from "./mcp/index.ts"
import { requestLog } from "./request-log.ts"
import { cards } from "./routes/cards.ts"
import { clientLog } from "./routes/client-log.ts"
import { diveComputer } from "./routes/dive-computer.ts"
import { dives } from "./routes/dives.ts"
import { entities } from "./routes/entities.ts"
import { exports } from "./routes/export.ts"
import { health } from "./routes/health.ts"
import { imports } from "./routes/import.ts"
import { log } from "./routes/log.ts"
import { ops } from "./routes/ops.ts"
import { samples } from "./routes/samples.ts"
import { packing } from "./routes/packing.ts"
import { settings } from "./routes/settings.ts"
import { version } from "./routes/version.ts"
import { readOnly, security } from "./security.ts"
import { web } from "./static.ts"

// Room for an import's apply over thousands of dives.
const jsonLimit = bodyLimit({
  maxSize: 5 * 1024 * 1024,
  onError: (c) => c.json({ error: "The request is too large" }, 413),
})

export function createApp(deps: Deps) {
  return (
    factory
      .createApp()
      .use(async (c, next) => {
        c.set("deps", deps)
        await next()
      })
      // First, so refusals by the checks below are logged too.
      .use("/api/*", requestLog)
      .use("/mcp", requestLog)
      // Gzip for clients that accept it, skipping non-text types such as
      // card images and bodies under 1 KB. Tailscale Serve passes it through.
      .use(compress())
      // json() sets no Content-Length, which compress needs to see a body
      // is too small to be worth it.
      .use("/api/*", async (c, next) => {
        await next()
        const type = c.res.headers.get("Content-Type") ?? ""
        if (
          type.startsWith("application/json") &&
          !c.res.headers.has("Content-Length")
        ) {
          const body = await c.res.arrayBuffer()
          c.res = new Response(body, c.res)
          c.res.headers.set("Content-Length", String(body.byteLength))
        }
      })
      .use("/api/*", security(deps.env))
      // A JSON body is a list or a few fields at most, so one far larger is
      // refused before Node buffers and parses it; uploads set their own caps.
      // Media types ignore case, as the security check and the parser do.
      .use("/api/*", (c, next) =>
        c.req
          .header("Content-Type")
          ?.toLowerCase()
          .startsWith("application/json")
          ? jsonLimit(c, next)
          : next()
      )
      // Ahead of the pause below: the phone's error reports write nothing,
      // and matter most once the database has failed its check.
      .route("/api", clientLog)
      // A failed integrity check stops every write until a restore.
      .use("/api/*", async (c, next) => {
        if (deps.state.integrity === "failed" && !readOnly.has(c.req.method)) {
          c.set("refusal", savingPaused)
          return c.json({ error: savingPaused }, 503)
        }
        await next()
      })
      .route("/api", version)
      .route("/api", log)
      .route("/api", samples)
      .route("/api", ops)
      .route("/api", dives)
      .route("/api", entities)
      .route("/api", settings)
      .route("/api", packing)
      .route("/api", cards)
      .route("/api", exports)
      .route("/api", imports)
      .route("/api", diveComputer)
      .route("/api", health)
      // Ahead of the app's pages, whose catch-all answers any GET.
      .route("/mcp", mcp(deps))
      .route("/", web(deps.webRoot, deps.env.SHYLOG_APP_NAME))
      // A refused write has rolled back; the reason goes to the draft's
      // card or the form.
      .onError((error, c) => {
        if (error instanceof Rejected) {
          c.set("refusal", error.logged)
          return c.json(
            { ...error.details, error: error.message, path: error.path },
            error.status
          )
        }
        // Hono's own, such as a malformed JSON body, carry their response.
        if (error instanceof HTTPException) return error.getResponse()
        // As Hono's default does: a rethrow reaches the Node adapter, which
        // answers an empty 500 and logs nothing.
        logger.error({ event: "error", err: error }, error.message)
        return c.text("Internal Server Error", 500)
      })
  )
}

export type AppType = ReturnType<typeof createApp>
