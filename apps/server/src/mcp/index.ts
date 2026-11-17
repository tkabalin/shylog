import { createMcpHandler, McpServer } from "@modelcontextprotocol/server"

import { factory, type Deps } from "../factory.ts"
import { logger } from "../log.ts"
import { guard } from "./guard.ts"
import { instructions } from "./instructions.ts"
import { readTools } from "./tools/read.ts"
import { siteTools } from "./tools/sites.ts"
import { writeTools } from "./tools/write.ts"

// Claude's way into the log (see MCP server in the spec), kept apart from
// the API it reuses the rules of. Stateless: each request gets a fresh
// server, under the 2026-07-28 protocol or the 2025 one Claude Desktop's
// bridge may still speak.
export function mcp(deps: Deps) {
  const handler = createMcpHandler(
    () => {
      const server = new McpServer(
        {
          name: "shylog",
          title: deps.env.SHYLOG_APP_NAME,
          version: deps.env.SHYLOG_REVISION,
        },
        { instructions: instructions(deps.db, deps.env) }
      )
      readTools(server, deps)
      writeTools(server, deps)
      if (deps.env.SHYLOG_EXPLORE === "on") siteTools(server)
      return server
    },
    {
      // A tool call is a few fields; nothing near the API's import bodies.
      maxRequestBodySize: 1024 * 1024,
      // By name only: a malformed body's message can quote it, and logs
      // never hold what the diver wrote.
      onerror: (error) =>
        logger.warn({ event: "mcp_refused", reason: error.name }),
    }
  )
  // GET and DELETE reach the handler, which refuses them, rather than the
  // app's catch-all, which would answer with its page, and nothing else
  // under /mcp, such as a URL added with a trailing slash, falls through.
  return factory
    .createApp()
    .use(guard(deps.env))
    .on(["POST", "GET", "DELETE"], "/", (c) => handler.fetch(c.req.raw))
    .all("*", (c) => c.json({ error: "Not found" }, 404))
}
