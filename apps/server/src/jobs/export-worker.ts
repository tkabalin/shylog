import { parentPort, workerData } from "node:worker_threads"

import Database from "better-sqlite3"

import { buildUddf, writeFiles, type WorkerData } from "./export.ts"

// One export on its own thread (see inWorker), so the server keeps answering
// while it runs. Its own connection is read-only, and WAL lets it read beside
// the server's writes: one read transaction sees the log as it began.
const { source, job } = workerData as WorkerData
const db =
  typeof source === "string"
    ? new Database(source, { readonly: true, fileMustExist: true })
    : new Database(Buffer.from(source), { readonly: true })
try {
  if (job.kind === "files") {
    parentPort!.postMessage(writeFiles(db, job.dataDir, job.now))
  } else {
    const file = buildUddf(db)
    parentPort!.postMessage(file, [file.buffer])
  }
} finally {
  db.close()
}
