import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"
import { write } from "../journal.ts"
import type { Watch } from "./dctool.ts"

// The watch this log downloads from (see Downloading from the dive computer
// in the spec), journalled like any log data, so a restore brings it back.

export interface StoredComputer extends Watch {
  // The newest applied dive's start on the watch's clock.
  marker: string | null
  lastDownloadAt: string | null
}

export function storedComputer(db: Db): StoredComputer | null {
  return (
    prepared<[], StoredComputer>(
      db,
      `SELECT serial, model, marker, last_download_at AS lastDownloadAt
       FROM dive_computer`
    ).get() ?? null
  )
}

// Replayed as journalled, so these take no time of their own.
export function insertComputer(db: Db, watch: Watch) {
  prepared(
    db,
    "INSERT INTO dive_computer (id, serial, model) VALUES (1, ?, ?)"
  ).run(watch.serial, watch.model)
}

export function deleteComputer(db: Db) {
  prepared(db, "DELETE FROM dive_computer").run()
}

// Only for the watch it names, so a Forget between download and apply
// leaves nothing behind.
export function moveMarker(
  db: Db,
  { serial, marker }: { serial: string; marker: string },
  at: Date
) {
  prepared(
    db,
    "UPDATE dive_computer SET marker = ?, last_download_at = ? WHERE serial = ?"
  ).run(marker, at.toISOString(), serial)
}

export function rememberComputer(db: Db, watch: Watch) {
  write(db, (journal) => {
    insertComputer(db, watch)
    journal({ type: "rememberComputer", payload: watch })
  })
}

export function forgetComputer(db: Db) {
  write(db, (journal) => {
    if (!storedComputer(db)) return
    deleteComputer(db)
    journal({ type: "forgetComputer", payload: {} })
  })
}

// Before the first download from a watch, the newest dive already imported
// from its model, as its start on the computer's clock is the dive's
// fingerprint there; deleted dives count, as their fingerprints still keep
// them out. Null if none was, so the first download reads every dive.
export function firstMarker(db: Db, model: string): string | null {
  return (
    prepared<[string], string | null>(
      db,
      `SELECT max(substr(f.fingerprint, 1, 19)) FROM fingerprints f
       JOIN dives d ON d.id = f.dive_id
       WHERE d.computer_model = ?`
    )
      .pluck()
      .get(model) ?? null
  )
}
