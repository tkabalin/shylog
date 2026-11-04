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

import { Rejected } from "../apply/rejected.ts"
import type { Db } from "../db/open.ts"
import { syncDir } from "../fs.ts"
import type { Integrity } from "../integrity.ts"
import { setMeta } from "../journal.ts"
import { uddfNamespace, writeUddf } from "../uddf/writer.ts"

// Far longer than any export or snapshot download takes.
const stale = 60 * 60 * 1000

export const exportDir = (dataDir: string) => join(dataDir, "export")
export const exportFile = (dataDir: string) =>
  join(exportDir(dataDir), "dives.uddf")

// A temp file in the export folder, unique so the nightly run, a download
// and Export now never share one. Any left by a crash, or by a snapshot
// download whose stream never closed, goes an hour later.
export function exportTemp(dataDir: string, suffix: string, now = new Date()) {
  const dir = exportDir(dataDir)
  mkdirSync(dir, { recursive: true })
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".tmp"))) {
    const stat = statSync(join(dir, name), { throwIfNoEntry: false })
    if (stat && now.getTime() - stat.mtimeMs > stale) {
      rmSync(join(dir, name), { force: true })
    }
  }
  return join(dir, `.${randomUUID().slice(0, 8)}${suffix}.tmp`)
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

// Builds the export and replaces export/dives.uddf with it: written to a
// temp file and flushed, read back and checked, and only then renamed over
// the last one. Any failure throws and leaves that file.
export function writeExport(
  db: Db,
  dataDir: string,
  integrity: Integrity,
  now = new Date()
) {
  refuseDamaged(integrity)
  const { xml, dives } = writeUddf(db)
  const file = exportFile(dataDir)
  const temp = exportTemp(dataDir, ".uddf", now)
  try {
    const fd = openSync(temp, "w")
    try {
      writeFileSync(fd, xml)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    checkUddf(readFileSync(temp, "utf8"), dives)
    renameSync(temp, file)
    syncDir(exportDir(dataDir))
  } finally {
    rmSync(temp, { force: true })
  }
  // Outside the journal, as the snapshot's time is. A success clears a
  // failed night's alert, by Export now or the next night. The file is
  // already in place, so a full disk refusing these only leaves the times.
  try {
    setMeta(db, "last_export_at", now.toISOString())
    setMeta(db, "export_failed_at", null)
  } catch (error) {
    console.error("Couldn’t record the export’s time:", error)
  }
}
