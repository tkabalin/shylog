import { describe, expect, it } from "vitest"

import { testApp } from "../../test/app.ts"
import { testDb } from "../../test/db.ts"
import { captureLog } from "../../test/log.ts"
import { callTool, mcpClient, mcpRequest } from "../../test/mcp.ts"

const ping = { jsonrpc: "2.0", id: 1, method: "ping" }

describe("the MCP endpoint", () => {
  it.each(["modern", "legacy"] as const)(
    "serves the tools under the %s protocol",
    async (era) => {
      const client = await mcpClient(testApp(), { era })
      const { tools } = await client.listTools()
      expect(tools.map((tool) => tool.name)).toContain("get_dive")
      expect((await callTool(client, "search_dives")).json().showing).toBe(
        "0 of 0"
      )
    }
  )

  // Clients decide from the hints whether to ask before a call, and MCP
  // takes a missing one as destructive and open world.
  it("sets a title and every hint on each tool", async () => {
    const client = await mcpClient(testApp())
    const { tools } = await client.listTools()
    expect(
      Object.fromEntries(
        tools.map((tool) => [
          tool.name,
          { title: tool.title, ...tool.annotations },
        ])
      )
    ).toMatchSnapshot()
  })

  it("says whose log it is", async () => {
    const db = testDb()
    db.prepare("UPDATE settings SET diver_name = 'Sam'").run()
    const client = await mcpClient(testApp({ db }))
    expect(client.getInstructions()).toMatch(/^Shylog, Sam's dive log/)
  })
})

describe("every MCP request", () => {
  it("needs an allowed Tailscale login, refused with 403 not 401", async () => {
    const app = testApp()
    const refused = await mcpRequest(app, {
      headers: { "Tailscale-User-Login": "someone@example.com" },
      body: ping,
    })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toEqual({ error: "Login not allowed" })
    expect((await mcpRequest(app, { body: ping })).status).toBe(200)
  })

  it("refuses a request without a login", async () => {
    const app = testApp()
    const response = await app.request("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ping),
    })
    expect(response.status).toBe(403)
  })

  // Only Claude Code and the Desktop bridge call it, and a browser always
  // sends an Origin on a POST, which also stops DNS rebinding.
  it("refuses any request a browser sends", async () => {
    const response = await mcpRequest(testApp(), {
      headers: { Origin: "https://shylog.example.ts.net" },
      body: ping,
    })
    expect(response.status).toBe(403)
  })

  it("takes only JSON", async () => {
    const response = await mcpRequest(testApp(), {
      headers: { "Content-Type": "text/plain" },
      body: ping,
    })
    expect(response.status).toBe(415)
  })

  it("answers GET and DELETE itself rather than with the app's page", async () => {
    const app = testApp()
    for (const method of ["GET", "DELETE"]) {
      const response = await mcpRequest(app, { method })
      expect(response.status).toBe(405)
    }
  })

  it("logs a line without the arguments", async () => {
    const lines = captureLog()
    const client = await mcpClient(testApp())
    await callTool(client, "list_entities", { kind: "site", name: "Secret" })
    const line = lines.find((entry) => entry.event === "mcp_tool")
    expect(line).toMatchObject({
      tool: "list_entities",
      outcome: "ok",
    })
    expect(JSON.stringify(lines)).not.toContain("Secret")
  })

  it("logs an unexpected error with its stack and says only that it failed", async () => {
    const db = testDb()
    const client = await mcpClient(testApp({ db }))
    const lines = captureLog()
    // A fault inside the tool, where a refusal by the log's rules isn't.
    db.exec("DROP TABLE dive_tags")
    const reply = await callTool(client, "search_dives")
    expect(reply).toMatchObject({ isError: true, text: "Shylog hit an error." })
    const error = lines.find((entry) => entry.event === "error")
    expect(error?.err).toHaveProperty("stack")
  })
})

// A client refused by the MCP check looks for a sign-in there, which the
// app's page would otherwise answer.
it("has nothing under /.well-known", async () => {
  const response = await testApp().request(
    "/.well-known/oauth-protected-resource"
  )
  expect(response.status).toBe(404)
})
