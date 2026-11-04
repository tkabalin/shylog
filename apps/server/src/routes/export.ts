import { createReadStream, rmSync, statSync } from "node:fs"
import { Readable } from "node:stream"

import { writeCsv } from "../csv/writer.ts"
import { factory } from "../factory.ts"
import {
  checkCsv,
  checkUddf,
  exportTemp,
  refuseDamaged,
  writeExport,
} from "../jobs/export.ts"
import { localDate } from "../jobs/nightly.ts"
import { writeUddf } from "../uddf/writer.ts"

const attachment = (name: string) => `attachment; filename="${name}"`

// The You tab's downloads and Export now. A failure answers here and
// changes nothing else: only a failed night raises the alert.
export const exports = factory
  .createApp()
  // Hono answers HEAD from GET, which would build a whole export or
  // snapshot only to send no body.
  .use("/export/*", async (c, next) =>
    c.req.method === "HEAD" ? c.body(null, 405) : next()
  )
  // A fresh export, built and checked for the download alone: the server's
  // copy is the backup, replaced only by the nightly job and Export now.
  .get("/export/uddf", (c) => {
    const { db, state } = c.var.deps
    refuseDamaged(state.integrity)
    const { xml, dives } = writeUddf(db)
    checkUddf(xml, dives)
    return c.body(xml, 200, {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": attachment(`shylog-${localDate(new Date())}.uddf`),
    })
  })
  // A fresh CSV for a spreadsheet, likewise for the download alone.
  .get("/export/csv", (c) => {
    const { db, state } = c.var.deps
    refuseDamaged(state.integrity)
    const { csv, dives } = writeCsv(db)
    checkCsv(csv, dives)
    return c.body(csv, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": attachment(`shylog-${localDate(new Date())}.csv`),
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
