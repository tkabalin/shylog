import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs"
import { dirname, isAbsolute, join } from "node:path"
import { pipeline } from "node:stream/promises"
import { createGunzip } from "node:zlib"

import Database from "better-sqlite3"

import { cardsDir, hashOf } from "../cards/store.ts"
import { openDatabase, type Db } from "../db/open.ts"
import { syncDir } from "../fs.ts"
import { checkIntegrity } from "../integrity.ts"
import { snapshotName, snapshotsDir } from "../jobs/nightly.ts"
import { compare } from "./compare.ts"
import { replay, type Replay } from "./replay.ts"

// A bare name is looked up among the nightly snapshots, and a relative path
// in the data folder, since the container's working folder is the app's.
export function snapshotPath(dataDir: string, snapshot: string) {
  if (isAbsolute(snapshot)) return snapshot
  if (snapshot.includes("/")) return join(dataDir, snapshot)
  return join(snapshotsDir(dataDir), snapshot)
}

// Thrown before anything is moved, so the instance can start as it was.
export class SnapshotRefused extends Error {}

// Streamed, as the snapshot was, so a large log never sits in memory. A
// pre-migration snapshot is a plain VACUUM INTO copy, so it is copied.
async function unpack(snapshot: string, to: string) {
  const from = createReadStream(snapshot)
  const out = createWriteStream(`${to}.tmp`, { flush: true })
  await (snapshot.endsWith(".gz")
    ? pipeline(from, createGunzip(), out)
    : pipeline(from, out))
  renameSync(`${to}.tmp`, to)
}

// A gzip can unpack cleanly and still not hold a sound database, so it is
// checked before anything is moved.
function checkUnpacked(file: string) {
  const db = new Database(file, { readonly: true })
  try {
    if (checkIntegrity(db) === "ok") return
  } finally {
    db.close()
  }
  rmSync(file, { force: true })
  throw new Error("The snapshot is not a sound database")
}

// The swap under Restores in the spec, run with the app stopped. The
// snapshot is unpacked and checked first, so a wrong name or a damaged
// snapshot leaves the database in place. The moved-aside journal is
// replayed up to `replayTo`, and the rest listed.
export async function restore(
  dataDir: string,
  snapshot: string,
  replayTo?: number | "all",
  now = new Date()
) {
  const file = join(dataDir, "shylog.db")
  const unpacked = `${file}.restoring`
  try {
    await unpack(snapshotPath(dataDir, snapshot), unpacked)
    checkUnpacked(unpacked)
  } catch (error) {
    throw new SnapshotRefused(
      `${snapshot} can't be restored: ${(error as Error).message}`
    )
  }
  const aside = join(
    dataDir,
    "restore-aside",
    now.toISOString().replace(/[:.]/g, "-")
  )
  mkdirSync(aside, { recursive: true })
  // The last commits may still be in the WAL, so it moves with the database.
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(file + suffix)) {
      renameSync(file + suffix, join(aside, `shylog.db${suffix}`))
    }
  }
  syncDir(aside)
  syncDir(dirname(aside))
  renameSync(unpacked, file)
  syncDir(dataDir)

  const target = openDatabase(file)
  try {
    const replayed = replayAside(target, join(aside, "shylog.db"), replayTo)
    // Files a later edit pruned are gone, so a card can name missing pages.
    return { aside, ...replayed, cardProblems: checkCards(target, dataDir) }
  } finally {
    target.close()
  }
}

function replayAside(
  target: Db,
  moved: string,
  replayTo: number | "all" | undefined
): { replay: Replay | null; unlisted?: string } {
  if (!existsSync(moved)) return { replay: null }
  try {
    // Read-only, so the damaged copy stays as it was.
    const source = new Database(moved, { readonly: true })
    try {
      const upTo = replayTo === "all" ? Infinity : (replayTo ?? 0)
      return { replay: replay(target, source, upTo) }
    } finally {
      source.close()
    }
  } catch (error) {
    // With no replay asked for, an unreadable database (a case in the
    // spec's table) still leaves a good restore; only the list is lost.
    if (replayTo !== undefined) throw error
    return { replay: null, unlisted: (error as Error).message }
  }
}

// The journal can't rebuild card images, so each file the database names is
// checked against its hash.
function checkCards(db: Db, dataDir: string): string[] {
  const images = db
    .prepare("SELECT card_id AS id, hash FROM certification_images")
    .all() as { id: string; hash: string }[]
  return images.flatMap(({ id, hash }) => {
    const path = join(cardsDir(dataDir), id, hash)
    if (!existsSync(path)) return [`cards/${id}/${hash} is missing`]
    if (hashOf(readFileSync(path)) !== hash) {
      return [`cards/${id}/${hash} doesn't match its hash`]
    }
    return []
  })
}

export interface Drill {
  snapshot: string
  replay: Replay
  differences: string[]
}

// Restores the newest nightly snapshot to a scratch folder, replays a
// VACUUM INTO copy of the live journal onto it and compares the two, card
// image files included.
export async function drill(dataDir: string): Promise<Drill> {
  const dir = snapshotsDir(dataDir)
  const names = (existsSync(dir) ? readdirSync(dir) : [])
    .filter((name) => snapshotName.test(name))
    .sort()
  const snapshot = names.at(-1)
  if (!snapshot) throw new Error("There is no nightly snapshot to restore")

  // On disk in the data folder: /tmp is a tmpfs, which counts against the
  // container's memory limit the running server shares.
  const scratch = mkdtempSync(join(dataDir, "drill-"))
  try {
    await unpack(snapshotPath(dataDir, snapshot), join(scratch, "restored.db"))
    // Read-only, so the drill never writes to the live instance.
    const live = new Database(join(dataDir, "shylog.db"), { readonly: true })
    try {
      live.prepare("VACUUM INTO ?").run(join(scratch, "live.db"))
    } finally {
      live.close()
    }
    const restored = openDatabase(join(scratch, "restored.db"))
    const copy = openDatabase(join(scratch, "live.db"))
    try {
      const result = replay(restored, copy)
      const differences = [
        ...compare(restored, copy),
        ...checkCards(copy, dataDir),
      ]
      return { snapshot, replay: result, differences }
    } finally {
      restored.close()
      copy.close()
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}
