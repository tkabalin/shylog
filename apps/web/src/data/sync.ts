import { latestSchemaVersion } from "@shylog/core"

import { apiClient, type Log } from "@/api/client"

import { db as defaultDb, type Blocked, type LogDb, type Meta } from "./db"
import { answered, NoAnswer, RequestFailed, requestIdOf } from "./client-log"
import { fetchedMirror, writeMirror, type Mirror } from "./mirror"

export type SyncResult = "updated" | "unchanged" | "blocked"

// Fetches /api/log with the version the mirror holds as its ETag, and
// writes what changed to the mirror (see writeMirror). `show` has the log
// first, so memory needn't wait for IndexedDB. No answer throws NoAnswer,
// leaving the mirror as it was.
export async function syncLog(
  options: {
    db?: LogDb
    fetch?: typeof globalThis.fetch
    show?: (
      mirror: Mirror,
      current: () => Promise<boolean>
    ) => void | Promise<void>
  } = {}
): Promise<SyncResult> {
  const db = options.db ?? defaultDb
  const meta = (await db.meta.get("log")) as Meta | undefined
  const found = (await db.meta.get("blocked")) as Blocked | undefined
  const blocked = found && found.schemaVersion > latestSchemaVersion
  // Blocked, it still asks, in case the server was rolled back, but with
  // the blocking version's tag, so an unchanged server costs a 304.
  const tag = blocked ? found.version : meta?.version
  const res = await apiClient(answered(options.fetch)).api.log.$get(undefined, {
    headers: tag ? { "If-None-Match": `"${tag}"` } : {},
  })
  if (res.status === 304) return blocked ? "blocked" : "unchanged"
  // Tailscale Serve, or Vite's proxy, answers 502 or 504 for a server that
  // is down (restarting after a deploy, say), which is no answer from it.
  if (res.status === 502 || res.status === 504)
    throw new NoAnswer(`The log request failed: ${res.status}`)
  if (res.status !== 200)
    throw new RequestFailed(
      `The log request failed: ${res.status}`,
      requestIdOf(res)
    )
  // A connection dropped part-way through the body is no answer too, not
  // a fault to report: the likeliest failure on a weak signal.
  const log: Log = await res.json().catch((error: unknown) => {
    if (error instanceof TypeError)
      throw new NoAnswer(String(error), { cause: error })
    throw error
  })

  if (log.schemaVersion > latestSchemaVersion) {
    await db.meta.put({
      key: "blocked",
      schemaVersion: log.schemaVersion,
      version: log.version,
    })
    return "blocked"
  }
  const mirror = fetchedMirror(db, log)
  // Whether the mirror still holds the version this fetch began from. Once
  // an upload or another tab has written a newer log, showing this one
  // would flash older data, such as a dive just uploaded.
  const current = async () =>
    ((await db.meta.get("log")) as Meta | undefined)?.version === meta?.version
  await options.show?.(mirror, current)
  await writeMirror(db, mirror, meta?.version)
  return "updated"
}
