import { describe, expect, it } from "vitest"

import {
  apiHeaders,
  origin,
  send,
  testApp,
  testEnv,
  testWebRoot,
} from "../test/app.ts"
import { seededDb } from "../test/fixture.ts"
import { captureLog, type LogLine } from "../test/log.ts"
import { createApp } from "./app.ts"

const requests = (lines: LogLine[]) =>
  lines.filter((line) => line.event === "request")

describe("the request log", () => {
  it("logs each /api request once it ends", async () => {
    const app = testApp()
    const lines = captureLog()
    const res = await app.request("/api/dives/dive-none/samples", {
      headers: apiHeaders,
    })

    const id = res.headers.get("X-Request-Id")
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(requests(lines)).toEqual([
      expect.objectContaining({
        level: "warn",
        method: "GET",
        route: "/api/dives/:id/samples",
        path: "/api/dives/dive-none/samples",
        status: res.status,
        durationMs: expect.any(Number),
        requestId: id,
      }),
    ])
  })

  it("keeps the id the app sent, and replaces one that isn't valid", async () => {
    const app = testApp()
    const lines = captureLog()
    const sent = "0b6f7c1e-3a2d-4c8e-9f10-1a2b3c4d5e6f"
    const kept = await app.request("/api/log", {
      headers: { ...apiHeaders, "X-Request-Id": sent },
    })
    expect(kept.headers.get("X-Request-Id")).toBe(sent)
    const replaced = await app.request("/api/log", {
      headers: { ...apiHeaders, "X-Request-Id": "not valid!" },
    })
    const other = replaced.headers.get("X-Request-Id")
    expect(other).not.toBe("not valid!")
    expect(requests(lines).map((line) => line.requestId)).toEqual([sent, other])
    expect(requests(lines)[0]).toMatchObject({
      level: "info",
      route: "/api/log",
      status: 200,
    })
  })

  it("logs the phones' polls at debug and static files not at all", async () => {
    const app = testApp()
    const lines = captureLog()
    await app.request("/api/version", { headers: apiHeaders })
    await app.request("/api/health", { headers: apiHeaders })
    await app.request("/")
    await app.request("/manifest.webmanifest")
    expect(
      requests(lines).map(({ level, route }) => ({ level, route }))
    ).toEqual([
      { level: "debug", route: "/api/version" },
      { level: "debug", route: "/api/health" },
    ])
  })

  it("logs a server error with its stack under the request's id", async () => {
    const db = seededDb()
    const app = testApp({ db })
    db.close()
    const lines = captureLog()
    const res = await app.request("/api/log", { headers: apiHeaders })

    expect(res.status).toBe(500)
    const id = res.headers.get("X-Request-Id")
    expect(lines).toEqual([
      expect.objectContaining({
        level: "error",
        event: "error",
        requestId: id,
        err: expect.objectContaining({ stack: expect.any(String) }),
      }),
      expect.objectContaining({
        level: "error",
        event: "request",
        status: 500,
        requestId: id,
      }),
    ])
  })

  it("logs why the security checks refused a request, at warn", async () => {
    const app = testApp()
    const lines = captureLog()
    await app.request("/api/log")
    await app.request("/api/log", {
      headers: { ...apiHeaders, "Tailscale-User-Login": "x@example.com" },
    })
    await app.request("/api/dives/dive-1", {
      method: "PATCH",
      headers: { ...apiHeaders, "Content-Type": "application/json" },
      body: "{}",
    })
    expect(
      requests(lines).map(({ level, status, reason }) => ({
        level,
        status,
        reason,
      }))
    ).toEqual([
      { level: "warn", status: 403, reason: "Missing X-Shylog" },
      { level: "warn", status: 403, reason: "Login not allowed" },
      { level: "warn", status: 403, reason: "Wrong origin" },
    ])
  })

  it("logs a refused write's reason, without the names it gives the form", async () => {
    const db = seededDb()
    const app = testApp({ db })
    const siteId = (name: string) =>
      db.prepare("SELECT id FROM sites WHERE name = ?").pluck().get(name)
    const lines = captureLog()
    const missing = await send(app, "PATCH", "/api/dives/dive-none", {
      fields: { notes: "Saw a manta" },
    })
    const clash = await send(
      app,
      "PUT",
      `/api/entities/site/${siteId("Unnamed site")}`,
      { name: "Sodwana" }
    )

    expect(missing.status).toBe(404)
    expect(clash.status).toBe(409)
    expect(await clash.json()).toMatchObject({
      error: "There is already a site called Sodwana",
    })
    expect(
      requests(lines).map(({ level, status, reason }) => ({
        level,
        status,
        reason,
      }))
    ).toEqual([
      { level: "warn", status: 404, reason: "No such dive" },
      {
        level: "warn",
        status: 409,
        reason: "There is already a site with that name",
      },
    ])
    expect(JSON.stringify(lines)).not.toMatch(/Sodwana|manta/)
  })

  it("logs writes refused while saving is paused", async () => {
    const app = createApp({
      db: seededDb(),
      env: testEnv(),
      dbFile: null,
      webRoot: testWebRoot(),
      state: { integrity: "failed" },
    })
    const lines = captureLog()
    const res = await app.request("/api/dives/dive-1", {
      method: "DELETE",
      headers: { ...apiHeaders, Origin: origin },
    })
    expect(res.status).toBe(503)
    expect(requests(lines)).toEqual([
      expect.objectContaining({
        level: "warn",
        status: 503,
        reason: "Saving is paused: the database failed its check",
      }),
    ])
  })
})
