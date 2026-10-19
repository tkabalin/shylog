import { spawnSync } from "node:child_process"

import { describe, expect, it } from "vitest"

import { apiHeaders, login, origin, testApp } from "../test/app.ts"
import { decodeLogin } from "./security.ts"

// Write routes come later; these stand in for them.
function appWithWrites(env?: Record<string, string>) {
  return testApp({ env })
    .post("/api/echo", (c) => c.json({ ok: true }))
    .delete("/api/echo", (c) => c.json({ ok: true }))
    .put("/api/cards/:id", (c) => c.json({ ok: true }))
}

const post = (headers: Record<string, string>, body = "{}") =>
  appWithWrites().request("/api/echo", { method: "POST", headers, body })

describe("every API request", () => {
  it("needs the X-Shylog header", async () => {
    const app = testApp()
    const withoutIt = { "Tailscale-User-Login": login }
    expect(
      (await app.request("/api/version", { headers: withoutIt })).status
    ).toBe(403)
    expect(
      (await app.request("/api/version", { headers: apiHeaders })).status
    ).toBe(200)
  })

  it("needs an allowed Tailscale login", async () => {
    const app = testApp()
    const as = (who: string) =>
      app.request("/api/version", {
        headers: { "X-Shylog": "1", "Tailscale-User-Login": who },
      })
    expect((await as("someone@example.com")).status).toBe(403)
    expect((await as("=?utf-8?q?j=C3=B6rg@example.com?=")).status).toBe(200)
  })

  it("refuses a tagged device, which has no identity header", async () => {
    const res = await testApp().request("/api/version", {
      headers: { "X-Shylog": "1" },
    })
    expect(res.status).toBe(403)
  })

  it("takes the dev login in place of the header", async () => {
    const res = await testApp({ env: { SHYLOG_DEV_LOGIN: login } }).request(
      "/api/version",
      { headers: { "X-Shylog": "1" } }
    )
    expect(res.status).toBe(200)
  })
})

describe("a request that changes data", () => {
  const json = {
    ...apiHeaders,
    Origin: origin,
    "Content-Type": "application/json",
  }

  it("passes with the app's origin and JSON", async () => {
    expect((await post(json)).status).toBe(200)
  })

  it("needs a matching Origin", async () => {
    const noOrigin = { ...apiHeaders, "Content-Type": "application/json" }
    expect((await post(noOrigin)).status).toBe(403)
    expect(
      (await post({ ...json, Origin: "https://evil.example" })).status
    ).toBe(403)
  })

  it("needs the right content type", async () => {
    expect((await post({ ...json, "Content-Type": "text/plain" })).status).toBe(
      403
    )
    expect(
      (
        await post({
          ...json,
          "Content-Type": "application/json; charset=utf-8",
        })
      ).status
    ).toBe(200)
    const card = await appWithWrites().request("/api/cards/card-a", {
      method: "PUT",
      headers: json,
      body: "{}",
    })
    expect(card.status).toBe(403)
  })

  it("has no content type to check without a body", async () => {
    const res = await appWithWrites().request("/api/echo", {
      method: "DELETE",
      headers: { ...apiHeaders, Origin: origin },
    })
    expect(res.status).toBe(200)
  })
})

describe("the app's own files", () => {
  it("need none of the checks", async () => {
    const app = testApp()
    for (const path of ["/", "/manifest.webmanifest", "/sw.js"]) {
      expect((await app.request(path)).status, path).toBe(200)
    }
  })
})

describe("decodeLogin", () => {
  it("decodes RFC 2047 Q-encoded words, split or not", () => {
    expect(decodeLogin("diver@example.com")).toBe("diver@example.com")
    expect(decodeLogin("=?utf-8?q?j=C3=B6rg@example.com?=")).toBe(
      "jörg@example.com"
    )
    expect(
      decodeLogin("=?UTF-8?Q?Ana_Mar=C3=AD?= =?UTF-8?Q?a@example.com?=")
    ).toBe("Ana María@example.com")
  })
})

describe("starting the server", () => {
  it("exits in production with the dev login set", () => {
    const run = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/index.ts"],
      {
        cwd: new URL("..", import.meta.url),
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "production",
          SHYLOG_ORIGIN: origin,
          SHYLOG_DATA_DIR: "/nonexistent",
          SHYLOG_ALLOWED_LOGINS: login,
          SHYLOG_DEV_LOGIN: login,
        },
        encoding: "utf8",
        timeout: 20_000,
      }
    )
    expect(run.status).not.toBe(0)
    expect(run.stderr).toMatch(/SHYLOG_DEV_LOGIN must not be set in production/)
    // Vitest fails a synchronous test that overran, so match spawnSync's.
  }, 20_000)
})
