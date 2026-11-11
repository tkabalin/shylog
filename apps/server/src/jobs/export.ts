import { randomUUID } from "node:crypto"
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"

import { DOMParser, onErrorStopParsing } from "@xmldom/xmldom"
import { parse } from "csv-parse/sync"

import { Rejected } from "../apply/rejected.ts"
import { csvHeaders, writeCsv } from "../csv/writer.ts"
import type { Db } from "../db/open.ts"
import { syncDir } from "../fs.ts"
import type { Integrity } from "../integrity.ts"
import { setMeta } from "../journal.ts"
import { logger } from "../log.ts"
import { uddfNamespace, writeUddf } from "../uddf/writer.ts"

// Far longer than any export or snapshot download takes.
const stale = 60 * 60 * 1000

export const exportDir = (dataDir: string) => join(dataDir, "export")
export const exportFile = (dataDir: string) =>
  join(exportDir(dataDir), "dives.uddf")
export const csvFile = (dataDir: string) =>
  join(exportDir(dataDir), "dives.csv")

// Temp files left by a crash, or by a snapshot download whose stream never
// closed, go an hour later.
function sweepTemps(dataDir: string, now: Date) {
  const dir = exportDir(dataDir)
  mkdirSync(dir, { recursive: true })
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".tmp"))) {
    const stat = statSync(join(dir, name), { throwIfNoEntry: false })
    if (stat && now.getTime() - stat.mtimeMs > stale) {
      rmSync(join(dir, name), { force: true })
    }
  }
}

// Unique, so the nightly run, a download and Export now never share one.
const tempName = (dataDir: string, suffix: string) =>
  join(exportDir(dataDir), `.${randomUUID().slice(0, 8)}${suffix}.tmp`)

// A temp file in the export folder, after clearing stale ones.
export function exportTemp(dataDir: string, suffix: string, now = new Date()) {
  sweepTemps(dataDir, now)
  return tempName(dataDir, suffix)
}

// Its reads may not be trusted, and the server's last export may be the
// better copy. The routes answer 503 with this.
export function refuseDamaged(integrity: Integrity) {
  if (integrity === "failed") {
    throw new Rejected(
      "The database failed its check, so it can’t be exported",
      503
    )
  }
}

// Written and flushed, so a crash can't leave a half-written file to rename.
function writeFlushed(file: string, text: string) {
  const fd = openSync(file, "w")
  try {
    writeFileSync(fd, text)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

// Re-parsed and its dives counted, so a file that wouldn't open fails here
// rather than in Subsurface.
export function checkUddf(xml: string, dives: number) {
  const written = new DOMParser({ onError: onErrorStopParsing })
    .parseFromString(xml, "text/xml")
    .getElementsByTagNameNS(uddfNamespace, "dive").length
  if (written !== dives) {
    throw new Error(`The export holds ${written} dives, not ${dives}`)
  }
}

// Read by a standard parser, so a quoting slip in the encoder that splits
// or merges rows fails here rather than in a spreadsheet.
export function checkCsv(csv: string, dives: number) {
  const records = parse(csv, { bom: true }) as string[][]
  if (records.length !== dives + 1) {
    throw new Error(
      `The CSV export holds ${records.length - 1} rows, not ${dives}`
    )
  }
  if (records.some((record) => record.length !== csvHeaders.length)) {
    throw new Error(`The CSV export's rows aren't ${csvHeaders.length} wide`)
  }
}

// Replaces export/dives.uddf and dives.csv from one read: each is written,
// flushed, read back and its dives counted before either is renamed over
// the last, so a failed check leaves both files.
export function writeExport(
  db: Db,
  dataDir: string,
  integrity: Integrity,
  now = new Date()
) {
  refuseDamaged(integrity)
  const { xml, dives, csv } = db.transaction(() => ({
    ...writeUddf(db),
    csv: writeCsv(db),
  }))()
  sweepTemps(dataDir, now)
  const temp = tempName(dataDir, ".uddf")
  const csvTemp = tempName(dataDir, ".csv")
  try {
    writeFlushed(temp, xml)
    checkUddf(readFileSync(temp, "utf8"), dives)
    writeFlushed(csvTemp, csv.csv)
    checkCsv(readFileSync(csvTemp, "utf8"), csv.dives)
    renameSync(temp, exportFile(dataDir))
    renameSync(csvTemp, csvFile(dataDir))
    syncDir(exportDir(dataDir))
  } finally {
    rmSync(temp, { force: true })
    rmSync(csvTemp, { force: true })
  }
  // Outside the journal, as the snapshot's time is. A success clears a
  // failed night's alert, by Export now or the next night. The files are
  // already in place, so a full disk refusing these only leaves the times.
  try {
    setMeta(db, "last_export_at", now.toISOString())
    setMeta(db, "export_failed_at", null)
  } catch (error) {
    logger.error(
      { event: "export_time_not_recorded", err: error },
      "Couldn’t record the export’s time"
    )
  }
  return {
    dives,
    uddfBytes: Buffer.byteLength(xml),
    csvBytes: Buffer.byteLength(csv.csv),
  }
}
