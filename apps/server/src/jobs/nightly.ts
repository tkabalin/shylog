import { randomUUID } from "node:crypto"
import {
  createReadStream,
  createWriteStream,
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
import { setMeta } from "../journal.ts"

const day = 24 * 60 * 60 * 1000
export const snapshotName = /^shylog-(\d{4}-\d{2}-\d{2})\.db\.gz$/

export const snapshotsDir = (dataDir: string) => join(dataDir, "snapshots")

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
  const file = join(dir, `shylog-${localDate(now)}.db.gz`)
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
    if (!keep.has(date)) rmSync(join(dir, `shylog-${date}.db.gz`))
  }
}

// A failure is logged and leaves the last snapshot time as it was, so
// Settings shows the backup has stalled; the next night tries again.
export async function nightly(db: Db, dataDir: string, now = new Date()) {
  try {
    await snapshot(db, dataDir, now)
    prune(dataDir, localDate(now), now)
  } catch (error) {
    console.error("Nightly snapshot failed:", error)
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
