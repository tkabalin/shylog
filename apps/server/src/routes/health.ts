import { statSync } from "node:fs"

import { prepared } from "../db/prepared.ts"
import { factory } from "../factory.ts"
import { getMeta } from "../journal.ts"

export const health = factory.createApp().get("/health", (c) => {
  const { db, dbFile, state } = c.var.deps
  // The WAL file is absent until the first write and after a clean close.
  const walBytes = dbFile
    ? (statSync(`${dbFile}-wal`, { throwIfNoEntry: false })?.size ?? 0)
    : 0
  return c.json({
    walBytes,
    integrity: state.integrity,
    writesPaused: state.integrity === "failed",
    // Ignored dives count, since this guards against lost data.
    diveCount: prepared(
      db,
      "SELECT count(*) FROM dives WHERE deleted_at IS NULL"
    )
      .pluck()
      .get() as number,
    lastSnapshotAt: getMeta(db, "last_snapshot_at"),
    lastExportAt: getMeta(db, "last_export_at"),
  })
})
