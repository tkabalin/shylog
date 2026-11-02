import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it, onTestFinished } from "vitest"

import {
  apiHeaders,
  send,
  testApp,
  testEnv,
  testWebRoot,
} from "../../test/app.ts"
import { createApp } from "../app.ts"
import { seededDb } from "../../test/fixture.ts"
import { openDatabase } from "../db/open.ts"
import { getMeta, setMeta } from "../journal.ts"
import { exportDir, exportFile } from "../jobs/export.ts"

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "shylog-export-"))
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
  const db = seededDb()
  const app = testApp({ db, env: { SHYLOG_DATA_DIR: dir } })
  return { dir, db, app }
}

const get = (
  app: { request: ReturnType<typeof testApp>["request"] },
  path: string
) => app.request(path, { headers: apiHeaders })

describe("GET /api/export/uddf", () => {
  it("rewrites the export file and streams it", async () => {
    const { dir, db, app } = setup()
    setMeta(db, "export_failed_at", "2026-10-22T00:00:00.000Z")
    const res = await get(app, "/api/export/uddf")

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe(
      "application/xml; charset=utf-8"
    )
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="shylog-\d{4}-\d\d-\d\d\.uddf"$/
    )
    const body = await res.text()
    expect(body.match(/<dive id=/g)).toHaveLength(46)
    expect(readFileSync(exportFile(dir), "utf8")).toBe(body)
    expect(readdirSync(exportDir(dir))).toEqual(["dives.uddf"])
    expect(getMeta(db, "last_export_at")).not.toBeNull()
    expect(getMeta(db, "export_failed_at")).toBeNull()
  })

  it("refuses a database that failed its check", async () => {
    const { dir, db } = setup()
    const app = createApp({
      db,
      env: testEnv({ SHYLOG_DATA_DIR: dir }),
      dbFile: null,
      webRoot: testWebRoot(),
      state: { integrity: "failed" },
    })
    const res = await get(app, "/api/export/uddf")
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({
      error: "The database failed its check, so it can’t be exported",
    })
    expect(existsSync(exportFile(dir))).toBe(false)
  })

  it("doesn't rewrite the file for a HEAD request", async () => {
    const { dir, app } = setup()
    const res = await app.request("/api/export/uddf", {
      method: "HEAD",
      headers: apiHeaders,
    })
    expect(res.status).toBe(405)
    expect(existsSync(exportFile(dir))).toBe(false)
  })

  it("needs the X-Shylog header", async () => {
    const { app } = setup()
    expect((await app.request("/api/export/uddf")).status).toBe(403)
  })
})

describe("GET /api/export/snapshot", () => {
  it("streams a VACUUM INTO copy and leaves no file behind", async () => {
    const { dir, db, app } = setup()
    const res = await get(app, "/api/export/snapshot")

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="shylog-\d{4}-\d\d-\d\d\.db"$/
    )
    const bytes = Buffer.from(await res.arrayBuffer())
    expect(Number(res.headers.get("Content-Length"))).toBe(bytes.length)
    const copy = join(dir, "copy.db")
    writeFileSync(copy, bytes)
    const restored = openDatabase(copy)
    onTestFinished(() => {
      restored.close()
    })
    const count = "SELECT count(*) FROM dives"
    expect(restored.prepare(count).pluck().get()).toBe(
      db.prepare(count).pluck().get()
    )
    // The stream's close removes the temp copy.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(readdirSync(exportDir(dir))).toEqual([])
  })
})

describe("POST /api/export/run", () => {
  it("rewrites the export without a body and clears a failure", async () => {
    const { dir, db, app } = setup()
    setMeta(db, "export_failed_at", "2026-10-22T00:00:00.000Z")
    const res = await send(app, "POST", "/api/export/run")

    expect(res.status).toBe(200)
    const { lastExportAt } = (await res.json()) as { lastExportAt: string }
    expect(getMeta(db, "last_export_at")).toBe(lastExportAt)
    expect(getMeta(db, "export_failed_at")).toBeNull()
    expect(
      readFileSync(exportFile(dir), "utf8").match(/<dive id=/g)
    ).toHaveLength(46)
  })

  it("needs the app's Origin", async () => {
    const { app } = setup()
    const res = await app.request("/api/export/run", {
      method: "POST",
      headers: apiHeaders,
    })
    expect(res.status).toBe(403)
  })
})
