import type { Db } from "./db/open.ts"
import { logger } from "./log.ts"

export type Integrity = "ok" | "failed"

// A failure pauses writes until the database is restored, and Settings
// shows the alert. A file corrupt enough makes the check itself throw.
export function checkIntegrity(db: Db): Integrity {
  try {
    const rows = db.pragma("integrity_check", { simple: false }) as {
      integrity_check: string
    }[]
    if (rows.length === 1 && rows[0].integrity_check === "ok") return "ok"
    // SQLite's own wording, naming pages and indexes, not their contents.
    logger.error(
      {
        event: "integrity_failed",
        problems: rows.slice(0, 20).map((row) => row.integrity_check),
      },
      "The database failed its integrity check"
    )
  } catch (error) {
    logger.error(
      { event: "integrity_failed", err: error },
      "The integrity check couldn’t run"
    )
  }
  return "failed"
}
