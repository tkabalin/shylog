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
import { Worker, type ResourceLimits } from "node:worker_threads"

import { DOMParser, onErrorStopParsing } from "@xmldom/xmldom"
import { parse } from "csv-parse/sync"

import { Rejected } from "../apply/rejected.ts"
import { csvHeaders, writeCsv } from "../csv/writer.ts"
import type { Db } from "../db/open.ts"
import { syncDir } from "../fs.ts"
import type { Integrity } from "../integrity.ts"
import { setMeta } from "../journal.ts"
import { logger } from "../log.ts"
import {
  uddfNamespace,
  writeUddfParts,
  type UddfParts,
} from "../uddf/writer.ts"

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
function writeFlushed(file: string, data: string | Uint8Array) {
  const fd = openSync(file, "w")
  try {
    writeFileSync(fd, data)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

// Parsed and its dives counted, so a file that wouldn't open fails here
// rather than in Subsurface: each dive on its own, under the root's
// namespace as in the file, then the rest without them.
export function checkUddf(uddf: UddfParts) {
  const parser = new DOMParser({ onError: onErrorStopParsing })
  const count = (xml: string) =>
    parser
      .parseFromString(xml, "text/xml")
      .getElementsByTagNameNS(uddfNamespace, "dive").length
  let written = 0
  for (const group of uddf.groups) {
    written += count(
      `<profiledata xmlns="${uddfNamespace}">${group}</profiledata>`
    )
  }
  written += count(uddf.head + uddf.tail)
  const dives = uddf.groups.length
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

// Replaces export/dives.uddf and dives.csv from one read: the UDDF is
// checked as built, each is written and flushed, and the CSV read back,
// before either is renamed over the last, so a failed check leaves both
// files. Run by the export worker.
export function writeFiles(db: Db, dataDir: string, now: Date) {
  const { uddf, csv } = db.transaction(() => ({
    uddf: writeUddfParts(db),
    csv: writeCsv(db),
  }))()
  checkUddf(uddf)
  const file = encodeUddf(uddf)
  sweepTemps(dataDir, now)
  const temp = tempName(dataDir, ".uddf")
  const csvTemp = tempName(dataDir, ".csv")
  try {
    writeFlushed(temp, file)
    writeFlushed(csvTemp, csv.csv)
    checkCsv(readFileSync(csvTemp, "utf8"), csv.dives)
    renameSync(temp, exportFile(dataDir))
    renameSync(csvTemp, csvFile(dataDir))
    syncDir(exportDir(dataDir))
  } finally {
    rmSync(temp, { force: true })
    rmSync(csvTemp, { force: true })
  }
  return {
    dives: uddf.groups.length,
    uddfBytes: file.byteLength,
    csvBytes: Buffer.byteLength(csv.csv),
  }
}

// Encoded a part at a time outside the heap: one 20 MB string could pass
// the 16 MB an ending worker may still allocate, which aborts the process.
function encodeUddf(uddf: UddfParts) {
  const parts = [uddf.head, ...uddf.groups, uddf.tail]
  const file = new Uint8Array(
    parts.reduce((sum, part) => sum + Buffer.byteLength(part), 0)
  )
  const encoder = new TextEncoder()
  let at = 0
  for (const part of parts) {
    at += encoder.encodeInto(part, file.subarray(at)).written
  }
  return file
}

// A fresh UDDF file for a download, checked as the nightly one is. Run by
// the worker, which hands the bytes over without a copy.
export function buildUddf(db: Db) {
  const uddf = writeUddfParts(db)
  checkUddf(uddf)
  return encodeUddf(uddf)
}

export type ExportJob =
  { kind: "files"; dataDir: string; now: Date } | { kind: "uddf" }

export interface WorkerData {
  // The database file, or a copy of an in-memory one (the tests'), which
  // can't be opened twice.
  source: string | Uint8Array
  job: ExportJob
}

// The worker's heap cap, 3/8 of the container's memory (384 MB of 1 GB;
// 1000 dives need 64 MB): an export past it ends the worker, not the
// server. An unknown limit (0) counts as none, as a 0 MB cap aborts too.
const heapLimitMb = Math.round(
  Math.min(1024, (process.constrainedMemory() || Infinity) / 2 ** 20) * 0.375
)

// The source beside this file under tsx and Vitest, and in the build its
// own entry beside the bundle (tsup.config.ts).
const workerUrl = new URL(
  import.meta.url.endsWith(".ts") ? "./export-worker.ts" : "./export-worker.js",
  import.meta.url
)

// One export at a time, as two at once would double the memory. Export
// now or a download during the nightly run waits for it, then reads the
// log afresh, so neither gets a copy older than the request.
let queue: Promise<unknown> = Promise.resolve()

// Tests pass a smaller cap, to run out of it on purpose.
export function inWorker<R>(
  db: Db,
  job: ExportJob,
  resourceLimits: ResourceLimits = { maxOldGenerationSizeMb: heapLimitMb }
): Promise<R> {
  const run = queue.then(
    () =>
      new Promise<R>((resolve, reject) => {
        const workerData: WorkerData = {
          source: db.memory ? db.serialize() : db.name,
          job,
        }
        const worker = new Worker(workerUrl, { workerData, resourceLimits })
        let result: { value: R } | undefined
        let failure: unknown
        worker.once("message", (value: R) => (result = { value }))
        // A throw or ERR_WORKER_OUT_OF_MEMORY, which comes before the exit.
        worker.once("error", (error) => (failure ??= error))
        // Settled once it has gone, so the next export never runs beside it.
        worker.once("exit", (code) => {
          if (failure) reject(failure)
          else if (result) resolve(result.value)
          else reject(new Error(`The export worker stopped with code ${code}`))
        })
      })
  )
  queue = run.catch(() => {})
  return run
}

// The nightly job's and Export now's write, then the time recorded on the
// server's own connection, as the worker's is read-only.
export async function writeExport(
  db: Db,
  dataDir: string,
  integrity: Integrity,
  now = new Date()
) {
  refuseDamaged(integrity)
  const written = await inWorker<ReturnType<typeof writeFiles>>(db, {
    kind: "files",
    dataDir,
    now,
  })
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
  return written
}

// Download UDDF's file, built in the worker for the download alone.
export async function exportUddf(db: Db, integrity: Integrity) {
  refuseDamaged(integrity)
  return inWorker<Uint8Array<ArrayBuffer>>(db, { kind: "uddf" })
}
