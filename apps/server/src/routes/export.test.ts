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
import { csvFile, exportDir, exportFile } from "../jobs/export.ts"
import { csvHeaders, writeCsv } from "../csv/writer.ts"

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
  it("streams a fresh export and leaves the server's copy alone", async () => {
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
    expect(body.match(/<dive id=/g)).toHaveLength(42)
    // Only the nightly job and Export now write the backup copy.
    expect(existsSync(exportDir(dir))).toBe(false)
    expect(getMeta(db, "last_export_at")).toBeNull()
    expect(getMeta(db, "export_failed_at")).toBe("2026-10-22T00:00:00.000Z")
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
  })

  it("needs the X-Shylog header", async () => {
    const { app } = setup()
    expect((await app.request("/api/export/uddf")).status).toBe(403)
  })

  it("doesn't build a download for a HEAD request", async () => {
    const { dir, app } = setup()
    for (const path of [
      "/api/export/uddf",
      "/api/export/csv",
      "/api/export/snapshot",
    ]) {
      const res = await app.request(path, {
        method: "HEAD",
        headers: apiHeaders,
      })
      expect(res.status).toBe(405)
    }
    expect(existsSync(exportDir(dir))).toBe(false)
  })
})

describe("GET /api/export/csv", () => {
  it("streams a fresh CSV and writes nothing on the server", async () => {
    const { dir, db, app } = setup()
    setMeta(db, "export_failed_at", "2026-10-22T00:00:00.000Z")
    const res = await get(app, "/api/export/csv")

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8")
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="shylog-\d{4}-\d\d-\d\d\.csv"$/
    )
    // Response.text() would drop the byte order mark Excel needs.
    const body = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
      await res.arrayBuffer()
    )
    expect(body).toBe(writeCsv(db).csv)
    expect(body.startsWith(`\uFEFF${csvHeaders.slice(0, 2).join(",")},`)).toBe(
      true
    )
    expect(existsSync(exportDir(dir))).toBe(false)
    expect(getMeta(db, "last_export_at")).toBeNull()
    expect(getMeta(db, "export_failed_at")).toBe("2026-10-22T00:00:00.000Z")
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
    const res = await get(app, "/api/export/csv")
    expect(res.status).toBe(503)
  })

  it("needs the X-Shylog header", async () => {
    const { app } = setup()
    expect((await app.request("/api/export/csv")).status).toBe(403)
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
    ).toHaveLength(42)
    expect(readFileSync(csvFile(dir), "utf8")).toBe(writeCsv(db).csv)
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
