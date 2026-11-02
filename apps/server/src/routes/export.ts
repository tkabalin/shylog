import { createReadStream, rmSync, statSync } from "node:fs"
import { Readable } from "node:stream"

import { factory } from "../factory.ts"
import { exportTemp, writeExport } from "../jobs/export.ts"
import { localDate } from "../jobs/nightly.ts"

const attachment = (name: string) => `attachment; filename="${name}"`

// The You tab's downloads and Export now (D4). A failure answers here and
// changes nothing else: only a failed night raises the alert.
export const exports = factory
  .createApp()
  .get("/export/uddf", (c) => {
    // Hono answers HEAD from GET, and asking about the file shouldn't
    // rewrite it.
    if (c.req.method === "HEAD") return c.body(null, 405)
    const { db, env, state } = c.var.deps
    const now = new Date()
    const xml = writeExport(db, env.SHYLOG_DATA_DIR, state.integrity, now)
    return c.body(xml, 200, {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": attachment(`shylog-${localDate(now)}.uddf`),
    })
  })
  // A consistent copy by VACUUM INTO, streamed and then removed. Served
  // even after a failed check, as a copy may still help with a restore.
  .get("/export/snapshot", (c) => {
    const { db, env } = c.var.deps
    const file = exportTemp(env.SHYLOG_DATA_DIR, ".db")
    try {
      db.prepare("VACUUM INTO ?").run(file)
    } catch (error) {
      rmSync(file, { force: true })
      throw error
    }
    const stream = createReadStream(file)
    // Also when the phone gives up part-way, which destroys the stream.
    stream.on("close", () => rmSync(file, { force: true }))
    return c.body(Readable.toWeb(stream) as ReadableStream, 200, {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Length": String(statSync(file).size),
      "Content-Disposition": attachment(`shylog-${localDate(new Date())}.db`),
    })
  })
  .post("/export/run", (c) => {
    const { db, env, state } = c.var.deps
    const now = new Date()
    writeExport(db, env.SHYLOG_DATA_DIR, state.integrity, now)
    return c.json({ lastExportAt: now.toISOString() })
  })
