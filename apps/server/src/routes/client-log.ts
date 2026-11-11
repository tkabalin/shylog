import { clientReportSchema } from "@shylog/core"
import { bodyLimit } from "hono/body-limit"

import { factory, type Deps } from "../factory.ts"
import { logger } from "../log.ts"
import { json } from "../validate.ts"

// A phone stuck in a loop of errors shouldn't flood the log; the app sends
// each error once a minute anyway. Per app, so tests don't share a count.
const perMinute = 30
const windows = new WeakMap<Deps, { start: number; count: number }>()

function allowed(deps: Deps, now = Date.now()) {
  const window = windows.get(deps)
  if (!window || now - window.start >= 60_000) {
    windows.set(deps, { start: now, count: 1 })
    return true
  }
  window.count += 1
  return window.count <= perMinute
}

// The app's own errors, logged beside the server's under the failed call's
// request id. Writes nothing to the database or the journal.
export const clientLog = factory.createApp().post(
  "/client-log",
  // First, so a stream of reports this server refuses is held back too.
  async (c, next) => {
    if (!allowed(c.var.deps)) {
      c.set("refusal", "Too many reports")
      return c.json({ error: "Too many reports" }, 429)
    }
    await next()
  },
  // Room for the cut message and stack; anything larger isn't a report.
  bodyLimit({
    maxSize: 16 * 1024,
    onError: (c) => c.json({ error: "The report is too large" }, 413),
  }),
  json(clientReportSchema),
  (c) => {
    const { kind, message, stack, requestId, route, version } =
      c.req.valid("json")
    logger.error(
      {
        event: "client_error",
        kind,
        failedRequestId: requestId,
        route,
        appVersion: version,
        stack,
      },
      message
    )
    return c.body(null, 204)
  }
)
