import type { Db } from "./db/open.ts"

export type Integrity = "ok" | "failed"

// A failure pauses writes until the database is restored, and Settings
// shows the alert. A file corrupt enough makes the check itself throw.
export function checkIntegrity(db: Db): Integrity {
  try {
    const rows = db.pragma("integrity_check", { simple: false }) as {
      integrity_check: string
    }[]
    if (rows.length === 1 && rows[0].integrity_check === "ok") return "ok"
    console.error("integrity_check failed:", rows)
  } catch (error) {
    console.error("integrity_check failed:", error)
  }
  return "failed"
}
