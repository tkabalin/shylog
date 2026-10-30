import { latestSchemaVersion } from "@shylog/core"

import { apiClient, type Log } from "@/api/client"

import {
  collections,
  db as defaultDb,
  type Blocked,
  type LogDb,
  type Meta,
} from "./db"
import { pruneCardImages } from "./cards"
import { pruneProfiles } from "./samples"

export type SyncResult = "updated" | "unchanged" | "blocked"

// Fetches /api/log with the version the mirror holds as its ETag, and
// replaces the mirror in one transaction, so a reader never sees half of
// two versions. A network failure throws, leaving the mirror as it was.
export async function syncLog(
  options: { db?: LogDb; fetch?: typeof globalThis.fetch } = {}
): Promise<SyncResult> {
  const db = options.db ?? defaultDb
  const meta = (await db.meta.get("log")) as Meta | undefined
  const found = (await db.meta.get("blocked")) as Blocked | undefined
  const blocked = found && found.schemaVersion > latestSchemaVersion
  // Blocked, it still asks, in case the server was rolled back, but with
  // the blocking version's tag, so an unchanged server costs a 304.
  const tag = blocked ? found.version : meta?.version
  const res = await apiClient(options.fetch).api.log.$get(undefined, {
    headers: tag ? { "If-None-Match": `"${tag}"` } : {},
  })
  if (res.status === 304) return blocked ? "blocked" : "unchanged"
  if (res.status !== 200)
    throw new Error(`The log request failed: ${res.status}`)
  const log: Log = await res.json()

  if (log.schemaVersion > latestSchemaVersion) {
    await db.meta.put({
      key: "blocked",
      schemaVersion: log.schemaVersion,
      version: log.version,
    })
    return "blocked"
  }
  await db.transaction(
    "rw",
    [...collections, "meta", "profiles", "cardImages"],
    async () => {
      // Another tab may have written a newer log while this one fetched.
      const now = (await db.meta.get("log")) as Meta | undefined
      if (now?.version !== meta?.version) return
      await Promise.all(collections.map((name) => db[name].clear()))
      await Promise.all([
        db.dives.bulkPut(log.dives),
        db.sites.bulkPut(log.sites),
        db.countries.bulkPut(log.countries.map((code) => ({ code }))),
        db.regions.bulkPut(log.regions),
        db.people.bulkPut(log.people),
        db.diveCentres.bulkPut(log.diveCentres),
        db.trips.bulkPut(log.trips),
        db.links.bulkPut(log.links),
        db.fieldMeta.bulkPut(log.fieldMeta),
        db.cards.bulkPut(
          log.cards.map((card, position) => ({ ...card, position }))
        ),
        pruneProfiles(db, new Set(log.dives.map((dive) => dive.id))),
        pruneCardImages(db, log.cards),
      ])
      await db.meta.delete("blocked")
      await db.meta.put({
        key: "log",
        version: log.version,
        schemaVersion: log.schemaVersion,
        serverTime: log.serverTime,
        settings: log.settings,
      })
    }
  )
  return "updated"
}
