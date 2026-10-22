import { join } from "node:path"
import { parseArgs } from "node:util"

import Database from "better-sqlite3"

import { openDatabase } from "./db/open.ts"
import { parseEnv } from "./env.ts"
import { checkIntegrity } from "./integrity.ts"
import { checkedSnapshot } from "./jobs/nightly.ts"
import {
  NotInJournal,
  rowsSql,
  type JournalRow,
  type Replay,
} from "./restore/replay.ts"
import { drill, restore, SnapshotRefused } from "./restore/restore.ts"

// The backup tools, run inside the app container by scripts/*.sh, so files
// written to the data folder belong to the container's user.
const usage =
  "Usage: cli.js snapshot | journal --since <time> | restore <snapshot> [--replay-to <seq>|all] | drill"

function parse() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        "replay-to": { type: "string" },
        since: { type: "string" },
      },
    })
  } catch {
    // An unknown or valueless option, such as a mistyped --replay-to.
    console.error(usage)
    process.exit(2)
  }
}

const { positionals, values } = parse()
const [command, ...rest] = positionals
const dataDir = parseEnv(process.env).SHYLOG_DATA_DIR

const line = (row: JournalRow) => `  ${row.seq}  ${row.appliedAt}  ${row.type}`

function report(result: Replay) {
  console.log(`Replayed ${result.replayed.length} journal entries.`)
  if (result.failure) {
    const { row, message } = result.failure
    console.log(`Entry ${row.seq} (${row.type}) failed: ${message}`)
  }
  if (result.notReplayed.length) {
    console.log("Not replayed:")
    for (const row of result.notReplayed) console.log(line(row))
  }
}

function replayTo(value: string | undefined) {
  if (value === undefined || value === "all") return value
  if (/^\d+$/.test(value)) return Number(value)
  console.error(usage)
  process.exit(2)
}

// Exit code 3 tells restore.sh nothing was moved, so the app can start again.
async function tryRestore(snapshot: string, upTo: number | "all" | undefined) {
  try {
    return await restore(dataDir, snapshot, upTo)
  } catch (error) {
    if (!(error instanceof SnapshotRefused)) throw error
    console.error(error.message)
    process.exit(3)
  }
}

// A restore that left entries out makes the newest snapshot hold some the
// live journal doesn't, until the next snapshot is taken.
async function tryDrill() {
  try {
    return await drill(dataDir)
  } catch (error) {
    if (!(error instanceof NotInJournal)) throw error
    console.error(error.message)
    console.error("Take a snapshot with scripts/backup.sh, then drill again.")
    process.exit(1)
  }
}

if (command === "snapshot" && !rest.length) {
  const db = openDatabase(join(dataDir, "shylog.db"))
  try {
    const file = await checkedSnapshot(db, dataDir, checkIntegrity(db))
    console.log(`Wrote ${file}`)
  } finally {
    db.close()
  }
} else if (command === "journal" && !rest.length && values.since) {
  // What a replay would apply, to choose where to stop before restoring.
  // Times are UTC; read-only, so it runs with the app up or stopped.
  const db = new Database(join(dataDir, "shylog.db"), { readonly: true })
  try {
    const rows = db
      .prepare(`${rowsSql} WHERE applied_at >= ? ORDER BY seq`)
      .all(values.since) as JournalRow[]
    for (const row of rows)
      console.log(`${line(row)}  ${row.payload.slice(0, 120)}`)
  } finally {
    db.close()
  }
} else if (command === "restore" && rest.length === 1) {
  const result = await tryRestore(rest[0], replayTo(values["replay-to"]))
  console.log(
    `Restored ${rest[0]}; the previous database is in ${result.aside}`
  )
  if (result.unlisted) {
    console.log(`The moved-aside journal can't be read: ${result.unlisted}`)
  } else if (!result.replay) {
    console.log("There was no database to move aside, so nothing to replay.")
  }
  if (result.replay) report(result.replay)
  if (result.cardProblems.length) {
    console.log("Card images the restored database names:")
    for (const problem of result.cardProblems) console.log(`  ${problem}`)
  }
  if (result.replay?.failure) process.exitCode = 1
} else if (command === "drill" && !rest.length) {
  const result = await tryDrill()
  console.log(`Restored ${result.snapshot} to a scratch folder.`)
  report(result.replay)
  if (result.differences.length) {
    console.log("Differences from the live database:")
    for (const difference of result.differences) console.log(`  ${difference}`)
  } else {
    console.log("No differences from the live database.")
  }
  if (result.replay.failure || result.differences.length) process.exitCode = 1
} else {
  console.error(usage)
  process.exitCode = 2
}
