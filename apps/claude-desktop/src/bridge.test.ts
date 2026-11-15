import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtempSync, rmSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PassThrough } from "node:stream"
import { fileURLToPath } from "node:url"

import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server"
import { build } from "tsup"
import { beforeAll, describe, expect, it, onTestFinished, vi } from "vitest"

import config from "../tsup.config.ts"
import { bridge } from "./bridge.ts"

// Node runs the TypeScript entry as it is; the bundle is what Desktop runs.
const source = fileURLToPath(new URL("./index.ts", import.meta.url))
let bundle: string
// Port 0 is never listening, so a connection is refused at once.
const nowhere = "http://127.0.0.1:0/mcp"

// A stand-in for an instance's /mcp, with the answers Tailscale Serve or
// the server give when something is wrong.
let server: Server | undefined
let url: (path?: string) => string
beforeAll(async () => {
  const dist = mkdtempSync(join(tmpdir(), "shylog-bridge-"))
  // Cleared even if the build or the server fails to start.
  const teardown = async () => {
    rmSync(dist, { recursive: true, force: true })
    server?.closeAllConnections()
    await new Promise((resolve) =>
      server ? server.close(resolve) : resolve(0)
    )
  }
  // Only this config, never one tsup would find in the working directory.
  await build({
    ...config,
    config: false,
    entry: { "server/index": source },
    outDir: dist,
    silent: true,
  }).catch(async (error: unknown) => {
    await teardown()
    throw error
  })
  bundle = join(dist, "server/index.mjs")

  const handler = createMcpHandler(() => {
    const mcp = new McpServer({ name: "stub", version: "1" })
    mcp.registerTool("ping", { description: "Answers pong" }, () => ({
      content: [{ type: "text", text: "pong" }],
    }))
    return mcp
  })
  const stub = createServer(async (request, response) => {
    if (request.url === "/refused/mcp") {
      response.writeHead(403).end('{"error":"Login not allowed"}')
      return
    }
    // As Tailscale Serve answers when the app behind it is down.
    if (request.url === "/down/mcp") {
      response.writeHead(502).end()
      return
    }
    // Never answers, as an instance gone quiet.
    if (request.url === "/silent/mcp") return
    // Starts a streamed reply, then stalls before any message.
    if (request.url === "/stalled/mcp") {
      response.writeHead(200, { "Content-Type": "text/event-stream" })
      response.flushHeaders()
      return
    }
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks)
    const answer = await handler.fetch(
      new Request(`http://127.0.0.1${request.url}`, {
        method: request.method,
        headers: request.headers as Record<string, string>,
        body: body.length ? body : undefined,
      })
    )
    response.writeHead(answer.status, Object.fromEntries(answer.headers))
    response.end(Buffer.from(await answer.arrayBuffer()))
  })
  server = stub
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve))
  const { port } = stub.address() as AddressInfo
  url = (path = "") => `http://127.0.0.1:${port}${path}/mcp`
  return teardown
})

// The bridge in this process, on streams standing in for Desktop's pipes.
async function inProcess(target: string, timeoutMs?: number) {
  const quiet = vi.spyOn(console, "error").mockImplementation(() => {})
  onTestFinished(() => quiet.mockRestore())
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const lines: Record<string, unknown>[] = []
  let buffer = ""
  stdout.on("data", (chunk) => {
    buffer += String(chunk)
    for (let end; (end = buffer.indexOf("\n")) >= 0;) {
      lines.push(JSON.parse(buffer.slice(0, end)))
      buffer = buffer.slice(end + 1)
    }
  })
  const session = await bridge(new URL(target), { stdin, stdout, timeoutMs })
  onTestFinished(() => session.close())
  return {
    send: (message: object) =>
      stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`),
    reply: async (id: number) => {
      await vi.waitFor(
        () => expect(lines.some((line) => line.id === id)).toBe(true),
        { timeout: 15_000 }
      )
      return lines.find((line) => line.id === id)!
    },
  }
}

const initialize = {
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "desktop", version: "1" },
  },
}

describe("the bridge", () => {
  it("passes a request through and its answer back", async () => {
    const pipe = await inProcess(url())
    pipe.send(initialize)
    expect(await pipe.reply(1)).toMatchObject({
      result: { serverInfo: { name: "stub" } },
    })
  })

  it.each([
    [
      "refused",
      "Shylog at 127.0.0.1:\\d+ refused this device's Tailscale login",
    ],
    ["down", "Shylog at 127.0.0.1:\\d+ answered with an error"],
    ["silent", "didn't answer within 0.2 s; check that Tailscale is connected"],
    [
      "stalled",
      "didn't answer within 0.2 s; check that Tailscale is connected",
    ],
  ])("tells Claude when the instance is %s", async (path, message) => {
    // Short only where nothing answers, so a slow machine still sees the
    // other answers before it.
    const pipe = await inProcess(
      url(`/${path}`),
      path === "silent" || path === "stalled" ? 200 : undefined
    )
    pipe.send(initialize)
    const answer = (await pipe.reply(1)) as { error: { message: string } }
    expect(answer.error.message).toMatch(new RegExp(message))
  })

  it("tells Claude when the instance can't be reached", async () => {
    const pipe = await inProcess(nowhere)
    pipe.send(initialize)
    const answer = (await pipe.reply(1)) as { error: { message: string } }
    expect(answer.error.message).toMatch(
      /^Can't reach Shylog at 127\.0\.0\.1:0; check that Tailscale is connected/
    )
  })
})

// Claude Desktop starting the extension: the 2025 handshake it speaks
// today, or the 2026-07-28 protocol, on the source and on the bundle.
describe.each([
  ["source", () => source],
  ["bundle", () => bundle],
])("the %s run as Desktop runs it", (_, entry) => {
  it.each(["legacy", "modern"] as const)(
    "passes a %s client's calls through",
    async (era) => {
      const client = new Client(
        { name: "desktop", version: "1" },
        era === "modern"
          ? { versionNegotiation: { mode: { pin: "2026-07-28" } } }
          : {}
      )
      onTestFinished(() => client.close())
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [entry(), url()],
          stderr: "ignore",
        })
      )
      const { tools } = await client.listTools()
      expect(tools.map((tool) => tool.name)).toEqual(["ping"])
      const reply = await client.callTool({ name: "ping", arguments: {} })
      expect(reply.content).toEqual([{ type: "text", text: "pong" }])
    }
  )
})

it("answers only requests, and stops when Desktop closes its input", async () => {
  const child = spawn(process.execPath, [source, nowhere], {
    stdio: ["pipe", "pipe", "ignore"],
  })
  // Close, not exit, so stdout is drained before the lines are counted.
  const closed = once(child, "close")
  onTestFinished(() => void child.kill())
  let out = ""
  child.stdout.on("data", (chunk) => (out += String(chunk)))
  const send = (message: object) =>
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`)
  send({ method: "notifications/initialized" })
  send({ id: 7, method: "ping" })
  await vi.waitFor(() => expect(out).toContain('"id":7'), { timeout: 15_000 })
  child.stdin.end()
  expect(await closed).toEqual([0, null])
  expect(out.trim().split("\n")).toHaveLength(1)
})
