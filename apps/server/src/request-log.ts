import { randomUUID } from "node:crypto"
import { requestIdPattern } from "@shylog/core"
import { matchedRoutes } from "hono/route"

import { factory } from "./factory.ts"
import { duringRequest, logger } from "./log.ts"

// Phones poll the first two, so a line for each would bury everything
// else; an accepted report's own client_error line is the one that matters.
const quiet = new Set(["/api/version", "/api/health", "/api/client-log"])

// One line per /api request once it has answered. Its level follows the
// outcome: a refusal warns with its reason, a server error is an error.
// A rate limit's refusals are debug, or each would be the flood it stops.
export const requestLog = factory.createMiddleware(async (c, next) => {
  // The app's own id when it sent one, so an error on the phone can be
  // found here; anything else is replaced rather than written to the log.
  const sent = c.req.header("X-Request-Id")
  const requestId = sent && requestIdPattern.test(sent) ? sent : randomUUID()
  const start = performance.now()
  await duringRequest(requestId, next)
  // After the handler, as a response it built itself, such as Hono's own
  // error for a malformed body, carries none of c.header()'s.
  c.res.headers.set("X-Request-Id", requestId)
  const status = c.res.status
  const level =
    status >= 500 && status !== 503
      ? "error"
      : status === 429
        ? "debug"
        : status >= 400
          ? "warn"
          : quiet.has(c.req.path)
            ? "debug"
            : "info"
  // The pattern of the handler that answered, such as /api/dives/:id, so
  // lines group by route. None when a middleware answered (a refusal), as
  // middleware match every method and handlers one.
  const answered = matchedRoutes(c)[c.req.routeIndex]
  const route = answered?.method === "ALL" ? undefined : answered?.path
  logger[level](
    {
      event: "request",
      requestId,
      method: c.req.method,
      route: route ?? null,
      path: c.req.path,
      status,
      durationMs: Math.round(performance.now() - start),
      reason: c.var.refusal,
    },
    `${c.req.method} ${c.req.path} ${status}`
  )
})
