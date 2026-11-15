import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client"
import { opVersion, type EntityKind } from "@shylog/core"

import { login, origin, send, type testApp } from "./app.ts"

type App = ReturnType<typeof testApp>

// Claude on the app's /mcp, as Claude Code reaches it through Serve: the
// 2026-07-28 protocol, or the 2025 one Claude Desktop's bridge may speak.
export async function mcpClient(
  app: App,
  options: { era?: "modern" | "legacy"; headers?: Record<string, string> } = {}
) {
  const transport = new StreamableHTTPClientTransport(new URL("/mcp", origin), {
    fetch: async (url, init) => app.request(url.toString(), init),
    requestInit: {
      headers: options.headers ?? { "Tailscale-User-Login": login },
    },
  })
  const client = new Client(
    { name: "test", version: "1" },
    options.era === "legacy"
      ? {}
      : { versionNegotiation: { mode: { pin: "2026-07-28" } } }
  )
  await client.connect(transport)
  return client
}

// A tool's reply, which is JSON text unless it refused.
export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown> = {}
) {
  const result = await client.callTool({ name, arguments: args })
  const [content] = result.content as { type: string; text: string }[]
  return {
    isError: result.isError === true,
    text: content.text,
    json: () => JSON.parse(content.text) as Record<string, unknown>,
  }
}

// A raw request to /mcp, for the checks a client never gets past.
export const mcpRequest = (
  app: App,
  init: { method?: string; headers?: Record<string, string>; body?: unknown }
) =>
  app.request("/mcp", {
    method: init.method ?? "POST",
    headers: {
      "Tailscale-User-Login": login,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })

// Drafts as the phone uploads them, to give the tools a log to read.
let count = 0
const base = () => ({
  opId: `op-mcp-${++count}`,
  opVersion,
  deviceId: "device-phone",
  at: new Date().toISOString(),
})

export const entityOp = (
  kind: EntityKind,
  id: string,
  fields: Record<string, unknown>
) => ({ ...base(), type: "upsertEntity", kind, id, fields })

export const diveOp = (diveId: string, fields: Record<string, unknown>) => ({
  ...base(),
  type: "upsertDive",
  diveId,
  fields,
})

export async function upload(app: App, ...ops: unknown[]) {
  const response = await send(app, "POST", "/api/ops", { ops })
  if (!response.ok) throw new Error(await response.text())
}
