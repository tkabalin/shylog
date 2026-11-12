import { join } from "node:path"
import { parseArgs } from "node:util"

import Database from "better-sqlite3"

import { openDatabase } from "./db/open.ts"
import { parseEnv } from "./env.ts"
import { checkIntegrity } from "./integrity.ts"
import { checkedSnapshot } from "./jobs/nightly.ts"
import { configureLog, logTo } from "./log.ts"
import {
  NotInJournal,
  rowsSql,
  type JournalRow,
  type Replay,
} from "./restore/replay.ts"
import { drill, restore, SnapshotRefused } from "./restore/restore.ts"
import { downloadToUddf } from "./download/convert.ts"
import { DownloadError, identify } from "./download/dctool.ts"
import { readWatch } from "./download/download.ts"
import { storedComputer } from "./download/computer.ts"
import { addStops, stopsToAdd } from "./download/stops.ts"

// The backup tools, and the one-off fill of mandatory stops, run inside the
// app container by scripts/*.sh, so files written to the data folder belong
// to the container's user.
const usage =
  "Usage: cli.js snapshot | journal --since <time> | restore <snapshot> [--replay-to <seq>|all] | drill | health | mandatory-stops [--dry-run]"

function parse() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        "replay-to": { type: "string" },
        since: { type: "string" },
        "dry-run": { type: "boolean" },
      },
    })
  } catch {
    // An unknown or valueless option, such as a mistyped --replay-to.
    console.error(usage)
    process.exit(2)
  }
}

// stdout is for the person running it; the server's own lines, such as a
// failed integrity check, go to stderr beside its errors.
logTo((line) => void process.stderr.write(line))

const { positionals, values } = parse()
const [command, ...rest] = positionals
const env = parseEnv(process.env)
// The instance and build on its lines too, as on the server's.
configureLog(env)
const dataDir = env.SHYLOG_DATA_DIR

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
} else if (command === "mandatory-stops" && !rest.length) {
  // Reads every dive off the watch on the cable, as Read every dive again
  // does, and gives the dives already in the log the stops it holds.
  const device = env.SHYLOG_DC_DEVICE
  if (!device) {
    console.error("This instance doesn't have the dive computer's cable.")
    process.exit(1)
  }
  const config = { device, command: env.SHYLOG_DCTOOL }
  const db = openDatabase(join(dataDir, "shylog.db"))
  try {
    const watch = await identify(config)
    // Another diver's watch, as a download would refuse it.
    const stored = storedComputer(db)
    if (stored && stored.serial !== watch.serial)
      throw new DownloadError(
        "failed",
        `This ${watch.model} isn't the ${stored.model} this log downloads from.`
      )
    console.log(`Reading every dive on the ${watch.model}...`)
    const dives = await readWatch(
      config,
      dataDir,
      {
        watch,
        after: null,
        accept: (found) => {
          if (found.serial !== watch.serial)
            throw new DownloadError("failed", "Another watch on the cable")
        },
      },
      new Date()
    )
    const uddf = downloadToUddf(dives, watch.model)
    const { found, twice } = values["dry-run"]
      ? stopsToAdd(db, uddf)
      : addStops(db, uddf)
    const when = (startTime: string) => startTime.replace("T", " ")
    for (const { startTime, stops } of found)
      console.log(
        `  ${when(startTime)}: ${stops.length} mandatory ${stops.length === 1 ? "stop" : "stops"}`
      )
    for (const { startTime } of twice)
      console.log(
        `  ${when(startTime)}: matches a dive another one does, left alone`
      )
    console.log(
      `Read ${dives.length} dives; ${found.length} in the log ${values["dry-run"] ? "would get" : "got"} mandatory stops.`
    )
    if (values["dry-run"])
      console.log("Dry run: nothing was written to the log.")
  } catch (error) {
    if (!(error instanceof DownloadError)) throw error
    console.error(error.message)
    if (error.detail) console.error(error.detail)
    process.exitCode = 1
  } finally {
    db.close()
  }
} else if (command === "health" && !rest.length) {
  // Docker's healthcheck, which scripts/update.sh waits on. It asks as Serve
  // would, as the first allowed login. A failed integrity check still passes:
  // the server keeps serving reads, and Settings shows the problem.
  const response = await fetch(`http://127.0.0.1:${env.PORT}/api/health`, {
    headers: {
      "X-Shylog": "1",
      "Tailscale-User-Login": env.SHYLOG_ALLOWED_LOGINS[0],
    },
    signal: AbortSignal.timeout(4000),
  })
  if (!response.ok) {
    console.error(`/api/health answered ${response.status}`)
    process.exitCode = 1
  }
} else {
  console.error(usage)
  process.exitCode = 2
}
