import { isJsonContentType } from "@modelcontextprotocol/server"

import type { Env } from "../env.ts"
import { factory } from "../factory.ts"
import { loginCheck } from "../security.ts"

// The MCP side of security.ts. Only Claude's clients call it, so any Origin
// (every browser POST has one) is refused, which also answers DNS rebinding.
// Refusals are 403, never 401, which would send a client to find a sign-in.
export function guard(env: Env) {
  const allowed = loginCheck(env)
  return factory.createMiddleware(async (c, next) => {
    const refuse = (error: string, status: 403 | 415) => {
      c.set("refusal", error)
      return c.json({ error }, status)
    }
    if (!allowed(c.req.header("Tailscale-User-Login"))) {
      return refuse("Login not allowed", 403)
    }
    if (c.req.header("Origin") !== undefined) {
      return refuse("Browsers can't use the MCP endpoint", 403)
    }
    if (
      c.req.method === "POST" &&
      !isJsonContentType(c.req.header("Content-Type"))
    ) {
      return refuse("Wrong content type", 415)
    }
    await next()
  })
}
