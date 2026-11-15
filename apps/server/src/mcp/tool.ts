import type {
  CallToolResult,
  McpServer,
  ToolAnnotations,
  ToolCallback,
} from "@modelcontextprotocol/server"
import type { z } from "zod"

import { Rejected } from "../apply/rejected.ts"
import { logger } from "../log.ts"
import { params } from "./params.ts"

interface Tool<S extends z.ZodObject> {
  title: string
  description: string
  input: S
  // Every hint set, as MCP takes a missing one as destructive and open
  // world, and clients decide from them whether to ask first.
  hints: Required<
    Pick<ToolAnnotations, "readOnlyHint" | "destructiveHint" | "idempotentHint">
  >
  // The log's version, from a tool that writes, so a failure after its
  // commit isn't reported as nothing saved, which would invite a repeat.
  version?: () => unknown
  run: (args: z.output<S>) => unknown
}

// A refusal Claude can act on: the parameter it was about, under the name
// Claude sent, then the rule's own message, and the entity a name clashes
// with. A path names a stored field, or already a parameter of the tool's.
function refusal(error: Rejected, own: Set<string>) {
  const field = error.path?.find(
    (part): part is string =>
      typeof part === "string" && (Object.hasOwn(params, part) || own.has(part))
  )
  const conflict = error.details?.conflict as
    { id: string; name: string } | undefined
  const diveId = error.details?.diveId
  let message = field
    ? `${own.has(field) ? field : params[field]}: ${error.message}`
    : error.message
  if (typeof diveId === "string") message += ` (dive ${diveId})`
  if (conflict) {
    message += `. The existing one is ${conflict.name}, id ${conflict.id}.`
  }
  return message
}

const text = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: typeof value === "string" ? value : JSON.stringify(value),
    },
  ],
})

// Registers a tool whose reply is compact JSON. Each call logs one line with
// its outcome, never its arguments, as the API's logs hold no dive contents.
// The SDK would pass on only an error's message, so refusals and failures
// are shaped here.
export function addTool<S extends z.ZodObject>(
  server: McpServer,
  name: string,
  tool: Tool<S>
) {
  const own = new Set(Object.keys(tool.input.shape))
  const call = (args: z.output<S>): CallToolResult => {
    const start = performance.now()
    const done = (outcome: string, reason?: string) =>
      logger.info(
        {
          event: "mcp_tool",
          tool: name,
          outcome,
          reason,
          durationMs: Math.round(performance.now() - start),
        },
        `${name} ${outcome}`
      )
    const before = tool.version?.()
    try {
      const reply = text(tool.run(args))
      done("ok")
      return reply
    } catch (error) {
      if (error instanceof Rejected) {
        done("refused", error.logged)
        return { ...text(refusal(error, own)), isError: true }
      }
      logger.error({ event: "error", tool: name, err: error })
      done("error")
      // Every write is one transaction, rolled back by a throw inside it.
      const message = !tool.version
        ? "Shylog hit an error."
        : tool.version() === before
          ? "Shylog hit an error; nothing was saved."
          : "The change was saved, but Shylog hit an error replying. Read it back before sending anything again."
      return { ...text(message), isError: true }
    }
  }
  server.registerTool(
    name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.input,
      annotations: { title: tool.title, ...tool.hints, openWorldHint: false },
    },
    // The SDK infers a schema's output through Standard Schema, which a
    // generic zod object doesn't resolve to; they are the same type.
    call as ToolCallback<S>
  )
}
