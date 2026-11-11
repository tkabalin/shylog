import { randomUUID } from "node:crypto"
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs"
import { join } from "node:path"
import { pipeline } from "node:stream/promises"
import { createGzip } from "node:zlib"

import type { Db } from "../db/open.ts"
import { syncDir } from "../fs.ts"
import { purgeExpiredPreviews } from "../import/preview.ts"
import type { Integrity } from "../integrity.ts"
import { setMeta } from "../journal.ts"
import { logger } from "../log.ts"
import { csvFile, exportFile, writeExport } from "./export.ts"

const day = 24 * 60 * 60 * 1000
export const snapshotName = /^shylog-(\d{4}-\d{2}-\d{2})\.db\.gz$/

export const snapshotsDir = (dataDir: string) => join(dataDir, "snapshots")

const snapshotFile = (dataDir: string, date: string) =>
  join(snapshotsDir(dataDir), `shylog-${date}.db.gz`)

// The server's local date, from the container's TZ, as the spec's midnight is.
export function localDate(now: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// A consistent copy by VACUUM INTO (a page copy that holds the server only
// briefly), gzipped as a stream, flushed under a temp name and renamed only
// when complete. A rerun on the same day replaces that day's snapshot.
export async function snapshot(db: Db, dataDir: string, now = new Date()) {
  const dir = snapshotsDir(dataDir)
  mkdirSync(dir, { recursive: true })
  const file = snapshotFile(dataDir, localDate(now))
  // Unique, so a backup.sh run during the nightly one can't share them.
  const temp = `${file}.${randomUUID().slice(0, 8)}`
  const raw = `${temp}.raw.tmp`
  const packed = `${temp}.tmp`
  try {
    db.prepare("VACUUM INTO ?").run(raw)
    await pipeline(
      createReadStream(raw),
      createGzip(),
      createWriteStream(packed, { flush: true })
    )
    renameSync(packed, file)
    syncDir(dir)
  } finally {
    rmSync(raw, { force: true })
    rmSync(packed, { force: true })
  }
  // Outside the journal: it is bookkeeping, not log data, and a new version
  // would make every client fetch the log again for nothing.
  setMeta(db, "last_snapshot_at", now.toISOString())
  return file
}

const utc = (date: string) => Date.parse(`${date}T00:00:00Z`)

const mondayOf = (date: string) => {
  const ms = utc(date)
  const weekday = (new Date(ms).getUTCDay() + 6) % 7
  return new Date(ms - weekday * day).toISOString().slice(0, 10)
}

// Daily for 90 days, then the newest of each week for two years and of each
// month forever. A finished week or month always keeps the same newest
// snapshot, so pruning nightly or after a gap leaves the same set.
export function retained(dates: string[], today: string): Set<string> {
  const newest = (period: (date: string) => string) => {
    const kept = new Map<string, string>()
    for (const date of dates) {
      const key = period(date)
      if (date > (kept.get(key) ?? "")) kept.set(key, date)
    }
    return new Set(kept.values())
  }
  const weekly = newest(mondayOf)
  const monthly = newest((date) => date.slice(0, 7))
  const twoYearsAgo = new Date(utc(today))
  twoYearsAgo.setUTCFullYear(twoYearsAgo.getUTCFullYear() - 2)
  return new Set(
    dates.filter(
      (date) =>
        utc(today) - utc(date) < 90 * day ||
        (weekly.has(date) && utc(date) >= twoYearsAgo.getTime()) ||
        monthly.has(date)
    )
  )
}

// Only nightly snapshots are pruned, with temp files a crashed run left over
// a day ago; pre-migration snapshots and anything else are left alone.
export function prune(dataDir: string, today: string, now = new Date()) {
  const dir = snapshotsDir(dataDir)
  const names = readdirSync(dir)
  for (const name of names.filter((name) => name.endsWith(".tmp"))) {
    // A run alongside, such as backup.sh, may remove its own meanwhile.
    const stat = statSync(join(dir, name), { throwIfNoEntry: false })
    if (stat && now.getTime() - stat.mtimeMs > day) {
      rmSync(join(dir, name), { force: true })
    }
  }
  const dates = names.flatMap((name) => snapshotName.exec(name)?.[1] ?? [])
  const keep = retained(dates, today)
  for (const date of dates) {
    if (!keep.has(date)) rmSync(snapshotFile(dataDir, date))
  }
}

// The nightly job's and the CLI's snapshot. A damaged database is not
// snapshotted, so the newest snapshot stays a good one and nothing is pruned.
export async function checkedSnapshot(
  db: Db,
  dataDir: string,
  integrity: Integrity,
  now = new Date()
) {
  if (integrity === "failed") {
    throw new Error("The database failed its check, so it is not snapshotted")
  }
  const file = await snapshot(db, dataDir, now)
  prune(dataDir, localDate(now), now)
  return file
}

// The snapshot, then the UDDF and CSV exports. A failure is logged and
// leaves the last time as it was, so You shows the backup has stalled; the
// next night tries again. A failed export also raises You's alert, unless
// the database failed its check, which has its own and takes no writes.
export async function nightly(
  db: Db,
  dataDir: string,
  integrity: Integrity,
  now = new Date()
) {
  // Expired import previews go first, so their files aren't backed up.
  if (integrity !== "failed") {
    try {
      purgeExpiredPreviews(db, now)
    } catch (error) {
      logger.error(
        { event: "preview_purge_failed", err: error },
        "Couldn’t purge expired import previews"
      )
    }
  }
  let start = performance.now()
  try {
    const file = await checkedSnapshot(db, dataDir, integrity, now)
    logger.info(
      {
        event: "snapshot",
        file,
        // Not a throw, which would log a written snapshot as failed.
        bytes: statSync(file, { throwIfNoEntry: false })?.size,
        durationMs: Math.round(performance.now() - start),
      },
      "Nightly snapshot written"
    )
  } catch (error) {
    logger.error(
      { event: "snapshot_failed", err: error },
      "Nightly snapshot failed"
    )
  }
  // Its refusal is the snapshot's, already logged, and the last export
  // stays the good one.
  if (integrity === "failed") return
  start = performance.now()
  try {
    const written = writeExport(db, dataDir, integrity, now)
    logger.info(
      {
        event: "export",
        ...written,
        durationMs: Math.round(performance.now() - start),
      },
      "Nightly export written"
    )
  } catch (error) {
    logger.error(
      { event: "export_failed", err: error },
      "Nightly export failed"
    )
    // A full disk can refuse this write too, and the run isn't awaited, so
    // a throw here would be an unhandled rejection that ends the server.
    try {
      setMeta(db, "export_failed_at", now.toISOString())
    } catch (metaError) {
      logger.error(
        { event: "export_failure_not_recorded", err: metaError },
        "Couldn’t record the failed export"
      )
    }
  }
}

// At each local midnight, worked out afresh every night so a clock change
// never shifts it. A timer firing a moment early still counts as midnight,
// so the snapshot never takes the day before's name.
export function scheduleNightly(run: (at: Date) => void, from = new Date()) {
  const next = new Date(from)
  next.setHours(24, 0, 0, 0)
  setTimeout(() => {
    const at = new Date(Math.max(Date.now(), next.getTime()))
    run(at)
    scheduleNightly(run, at)
  }, next.getTime() - Date.now())
}

// A server stopped over midnight missed that night's snapshot and export,
// so both are made at startup when today's snapshot is missing, or when
// either export file is (a first start, a new data folder, or the first
// start of a version that writes the CSV).
export function startNightly(
  dataDir: string,
  run: (at: Date) => void,
  from = new Date()
) {
  if (
    !existsSync(snapshotFile(dataDir, localDate(from))) ||
    !existsSync(exportFile(dataDir)) ||
    !existsSync(csvFile(dataDir))
  )
    run(from)
  scheduleNightly(run, from)
}
