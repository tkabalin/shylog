import { fileURLToPath } from "node:url"

import { createApp } from "../src/app.ts"
import type { Db } from "../src/db/open.ts"
import { parseEnv } from "../src/env.ts"
import { testDb } from "./db.ts"

export const origin = "https://shylog.example.ts.net"
export const login = "diver@example.com"

export const testEnv = (overrides: Record<string, string> = {}) =>
  parseEnv({
    NODE_ENV: "test",
    SHYLOG_ORIGIN: origin,
    SHYLOG_DATA_DIR: "/nonexistent",
    SHYLOG_ALLOWED_LOGINS: `${login}, jörg@example.com`,
    ...overrides,
  })

// A stand-in for apps/web/dist, checked in so tests make no temp folders.
export const testWebRoot = () =>
  fileURLToPath(new URL("./web/", import.meta.url))

// What the PWA sends on every API call, as Serve forwards it.
export const apiHeaders = { "X-Shylog": "1", "Tailscale-User-Login": login }

export function testApp(
  options: { db?: Db; env?: Record<string, string>; webRoot?: string } = {}
) {
  return createApp({
    db: options.db ?? testDb(),
    env: testEnv(options.env),
    dbFile: null,
    webRoot: options.webRoot ?? testWebRoot(),
    state: { integrity: "ok" },
  })
}

// A JSON write from the app, which also carries the Origin.
export function send(
  app: ReturnType<typeof testApp>,
  method: string,
  path: string,
  body?: unknown
) {
  return app.request(path, {
    method,
    headers: {
      ...apiHeaders,
      Origin: origin,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
