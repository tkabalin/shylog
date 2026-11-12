import { mkdirSync, mkdtempSync, readdirSync, rmdirSync } from "node:fs"
import { join } from "node:path"

import { computerName } from "@shylog/core"

import { Rejected } from "../apply/rejected.ts"
import type { Db } from "../db/open.ts"
import { storePreview } from "../import/preview.ts"
import { firstMarker, rememberComputer, storedComputer } from "./computer.ts"
import { diveStart, downloadToUddf } from "./convert.ts"
import {
  download,
  identify,
  parse,
  type DctoolConfig,
  type Watch,
} from "./dctool.ts"

// A watch other than the one this log downloads from, which could be the
// other diver's.
function refuseOther(stored: Watch | null, watch: Watch) {
  if (stored && stored.serial !== watch.serial) {
    throw new Rejected(
      `This ${computerName(watch.model)} isn't the ${computerName(stored.model)} this log downloads from. Forget it on You to use another.`,
      409
    )
  }
}

// What Detect shows: the watch on the cable and, if it is this log's, when
// it was last downloaded.
export async function detect(db: Db, config: DctoolConfig) {
  const watch = await identify(config)
  const stored = storedComputer(db)
  return {
    model: watch.model,
    known: stored?.serial === watch.serial,
    other: !!stored && stored.serial !== watch.serial,
    lastDownloadAt:
      stored?.serial === watch.serial ? stored.lastDownloadAt : null,
  }
}

const stamp = (now: Date) =>
  now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z")

// Reads the watch's dives after `after` (a start on its clock), or all of
// them, into a folder of its own under the data directory, where the raw
// download is kept, and parses each. `accept` refuses a watch by throwing.
export async function readWatch(
  config: DctoolConfig,
  dataDir: string,
  {
    watch,
    after,
    accept,
  }: { watch: Watch; after: string | null; accept: (found: Watch) => void },
  now: Date
) {
  // A folder of its own, even for two downloads in one second.
  const downloads = join(dataDir, "downloads")
  mkdirSync(downloads, { recursive: true })
  const dir = mkdtempSync(join(downloads, `${stamp(now)}-${watch.serial}-`))
  const { files } = await download(config, { dir, after, accept }).finally(
    () => {
      // Nothing new, or a refused watch, leaves no empty folder behind.
      if (!readdirSync(dir).length) rmdirSync(dir)
    }
  )
  // Each parse is its own dctool run on a file, clear of the cable, so a
  // few run at once; all at once could pass the container's process limit.
  const dives: { id: string; xml: string }[] = []
  for (let i = 0; i < files.length; i += 4) {
    const batch = files.slice(i, i + 4)
    const parsed = await Promise.all(
      batch.map((file) => parse(config, watch.model, file))
    )
    parsed.forEach((xml, j) => dives.push({ id: `dive-${i + j + 1}`, xml }))
  }
  return dives
}

// Reads the watch's dives after the last applied one (or every dive) into
// a preview, keeping the raw download in the data directory. Null when
// there is nothing new.
export async function downloadDives(
  db: Db,
  config: DctoolConfig,
  dataDir: string,
  { readAll = false }: { readAll?: boolean },
  now = new Date()
) {
  // Opened first for its model, which picks the starting dive, and so a
  // different watch is refused before anything is read or stored.
  const watch = await identify(config)
  const stored = storedComputer(db)
  refuseOther(stored, watch)
  // A remembered watch nothing was applied from yet (its first download
  // discarded, or with nothing new) still starts where the import left off.
  const earlierThan = stored?.marker ?? firstMarker(db, watch.model)
  const dives = await readWatch(
    config,
    dataDir,
    {
      watch,
      after: readAll ? null : earlierThan,
      // Swapped on the cable since it was opened.
      accept: (found) => refuseOther(stored ?? watch, found),
    },
    now
  )
  if (!stored) rememberComputer(db, watch)
  if (!dives.length) return null
  const uddf = downloadToUddf(dives, watch.model)
  // The files come newest first.
  const newest = diveStart(dives[0].xml)
  return storePreview(db, uddf, now, {
    serial: watch.serial,
    newest,
    earlierThan,
  })
}
