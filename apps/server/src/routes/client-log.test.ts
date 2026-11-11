import { describe, expect, it } from "vitest"

import {
  apiHeaders,
  origin,
  send,
  testApp,
  testEnv,
  testWebRoot,
} from "../../test/app.ts"
import { seededDb } from "../../test/fixture.ts"
import { captureLog } from "../../test/log.ts"
import { createApp } from "../app.ts"

const report = {
  kind: "sync",
  message: "The log request failed: 500",
  stack: "Error: The log request failed: 500\n    at syncLog (sync.ts:35)",
  requestId: "0b6f7c1e-3a2d-4c8e-9f10-1a2b3c4d5e6f",
  route: "/",
  version: "4f2a9c1",
}

describe("POST /api/client-log", () => {
  it("logs the app's error under the failed call's id", async () => {
    const app = testApp()
    const lines = captureLog()
    const res = await send(app, "POST", "/api/client-log", report)

    expect(res.status).toBe(204)
    expect(lines).toContainEqual(
      expect.objectContaining({
        level: "error",
        event: "client_error",
        kind: "sync",
        msg: report.message,
        stack: report.stack,
        failedRequestId: report.requestId,
        route: "/",
        appVersion: "4f2a9c1",
      })
    )
  })

  it("drops fields outside the schema and cuts long text", async () => {
    const app = testApp()
    const lines = captureLog()
    await send(app, "POST", "/api/client-log", {
      ...report,
      message: "m".repeat(3000),
      stack: "s".repeat(9000),
      dive: { notes: "Saw a whale shark" },
    })
    const line = lines.find((found) => found.event === "client_error")!
    expect(line.msg).toHaveLength(2048)
    expect(line.stack).toHaveLength(8192)
    expect(JSON.stringify(lines)).not.toContain("whale")
  })

  it("refuses a report that isn't one", async () => {
    const app = testApp()
    const res = await send(app, "POST", "/api/client-log", { kind: "info" })
    expect(res.status).toBe(400)
  })

  it("answers 429 past 30 reports a minute, below the log's level", async () => {
    const app = testApp()
    const lines = captureLog()
    const statuses: number[] = []
    for (let i = 0; i < 31; i++) {
      statuses.push((await send(app, "POST", "/api/client-log", report)).status)
    }
    expect(statuses.slice(0, 30).every((status) => status === 204)).toBe(true)
    expect(statuses[30]).toBe(429)
    expect(lines.filter((line) => line.status === 429)).toEqual([
      expect.objectContaining({ level: "debug", reason: "Too many reports" }),
    ])
  })

  it("counts reports it refuses toward the limit", async () => {
    const app = testApp()
    for (let i = 0; i < 30; i++) {
      await send(app, "POST", "/api/client-log", { kind: "info" })
    }
    const res = await send(app, "POST", "/api/client-log", report)
    expect(res.status).toBe(429)
  })

  it("takes reports while saving is paused", async () => {
    const app = createApp({
      db: seededDb(),
      env: testEnv(),
      dbFile: null,
      webRoot: testWebRoot(),
      state: { integrity: "failed" },
    })
    const res = await send(app, "POST", "/api/client-log", report)
    expect(res.status).toBe(204)
  })

  it("needs the Origin and a JSON body, as any write does", async () => {
    const app = testApp()
    const noOrigin = await app.request("/api/client-log", {
      method: "POST",
      headers: { ...apiHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(report),
    })
    const text = await app.request("/api/client-log", {
      method: "POST",
      headers: { ...apiHeaders, Origin: origin, "Content-Type": "text/plain" },
      body: JSON.stringify(report),
    })
    expect(noOrigin.status).toBe(403)
    expect(text.status).toBe(403)
  })

  it("refuses a body too large to be a report", async () => {
    const app = testApp()
    const res = await send(app, "POST", "/api/client-log", {
      ...report,
      stack: "s".repeat(20 * 1024),
    })
    expect(res.status).toBe(413)
  })

  it("writes nothing to the database or the journal", async () => {
    const db = seededDb()
    const app = testApp({ db })
    const state = () => ({
      ops: db.prepare("SELECT count(*) FROM ops").pluck().get(),
      meta: db.prepare("SELECT key, value FROM meta ORDER BY key").all(),
    })
    const before = state()
    await send(app, "POST", "/api/client-log", report)
    expect(state()).toEqual(before)
  })
})
