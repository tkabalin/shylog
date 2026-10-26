import { useSyncExternalStore } from "react"
import { latestSchemaVersion } from "@shylog/core"

import {
  db as defaultDb,
  type Blocked,
  type Dive,
  type DiveCentre,
  type FieldMeta,
  type LogDb,
  type Meta,
  type Person,
  type Region,
  type Settings,
  type Site,
  type Trip,
} from "./db"
import { downloadProfiles } from "./samples"
import { syncLog } from "./sync"

export interface DiveLinks {
  buddies: string[]
  professionals: string[]
  tags: string[]
}

// The mirror read into memory once per version, so screens render from it
// synchronously: opening a dive needs no request and no IndexedDB read.
export interface LogView {
  version: string
  settings: Settings
  // Logged dives (not deleted), newest first.
  dives: Dive[]
  dive: Map<string, Dive>
  sites: Map<string, Site>
  regions: Map<string, Region>
  people: Map<string, Person>
  diveCentres: Map<string, DiveCentre>
  trips: Map<string, Trip>
  links: Map<string, DiveLinks>
  fieldMeta: Map<string, Map<string, FieldMeta>>
}

export interface LogState {
  // Null until the first sync has filled an empty mirror.
  log: LogView | null
  loaded: boolean
  // The server runs a newer schema than this app knows.
  blocked: boolean
  // The last sync failed (offline, server unreachable, login refused).
  failed: boolean
}

const byId = <T extends { id: string }>(rows: T[]) =>
  new Map(rows.map((row) => [row.id, row]))

export async function readLog(db: LogDb = defaultDb): Promise<LogState> {
  return db.transaction("r", db.tables, async () => {
    const [meta, blocked] = await Promise.all([
      db.meta.get("log") as Promise<Meta | undefined>,
      db.meta.get("blocked") as Promise<Blocked | undefined>,
    ])
    // A flag an updated app now understands no longer blocks, as in syncLog.
    const state = {
      loaded: true,
      failed: false,
      blocked: !!blocked && blocked.schemaVersion > latestSchemaVersion,
    }
    if (!meta) return { ...state, log: null }
    const [dives, sites, regions, people, centres, trips, links, fieldMeta] =
      await Promise.all([
        db.dives.toArray(),
        db.sites.toArray(),
        db.regions.toArray(),
        db.people.toArray(),
        db.diveCentres.toArray(),
        db.trips.toArray(),
        db.links.toArray(),
        db.fieldMeta.toArray(),
      ])
    const logged = dives
      .filter((dive) => !dive.deletedAt)
      // Local wall-clock strings sort as dates. Ties take the server's
      // numbering, which follows the order they were written.
      .sort(
        (a, b) =>
          b.startTime.localeCompare(a.startTime) ||
          (b.number ?? 0) - (a.number ?? 0) ||
          b.id.localeCompare(a.id)
      )
    const linkMap = new Map<string, DiveLinks>()
    for (const link of links.sort((a, b) => a.position - b.position)) {
      let entry = linkMap.get(link.diveId)
      if (!entry) {
        entry = { buddies: [], professionals: [], tags: [] }
        linkMap.set(link.diveId, entry)
      }
      const list =
        link.type === "buddy"
          ? entry.buddies
          : link.type === "professional"
            ? entry.professionals
            : entry.tags
      list.push(link.target)
    }
    const metaMap = new Map<string, Map<string, FieldMeta>>()
    for (const row of fieldMeta) {
      if (!metaMap.has(row.diveId)) metaMap.set(row.diveId, new Map())
      metaMap.get(row.diveId)!.set(row.field, row)
    }
    return {
      ...state,
      log: {
        version: meta.version,
        settings: meta.settings,
        dives: logged,
        dive: byId(dives),
        sites: byId(sites),
        regions: byId(regions),
        people: byId(people),
        diveCentres: byId(centres),
        trips: byId(trips),
        links: linkMap,
        fieldMeta: metaMap,
      },
    }
  })
}

let state: LogState = {
  log: null,
  loaded: false,
  blocked: false,
  failed: false,
}
const listeners = new Set<() => void>()

function set(next: LogState) {
  state = next
  for (const listener of listeners) listener()
}

// Stable, so React doesn't resubscribe on every render.
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export const useLog = () => useSyncExternalStore(subscribe, () => state)

// The same copy outside React, for route loaders.
export const currentLog = () => state.log

// A failed read still marks the log loaded, so the screens can say so
// instead of staying blank, and the next sync tries again.
export async function loadLog(db: LogDb = defaultDb) {
  try {
    set({ ...(await readLog(db)), failed: state.failed })
  } catch (error) {
    console.warn("Couldn't read the log copy", error)
    set({ ...state, loaded: true })
  }
}

// Whether memory is behind the mirror, after a read that failed or a sync
// in another tab.
async function behind(db: LogDb = defaultDb) {
  const meta = (await db.meta.get("log")) as Meta | undefined
  return state.log?.version !== meta?.version
}

let syncing: Promise<void> | undefined

// Syncs now, then whenever the app comes back to the foreground and every
// five minutes while it is open, as the spec's version check does. A 304
// costs one small request; a failure (offline, server unreachable) just
// waits for the next try.
export function sync() {
  syncing ??= syncLog()
    .then(async (result) => {
      if (state.failed) set({ ...state, failed: false })
      if (result === "updated" || (await behind())) await loadLog()
      if (result === "blocked" && !state.blocked)
        set({ ...state, blocked: true })
      // Every dive's profile on the phone, so charts open at once offline;
      // not from a server whose schema this app doesn't understand.
      if (state.log && result !== "blocked")
        void downloadProfiles([...state.log.dive.values()])
    })
    .catch((error: unknown) => {
      // Expected offline or with Tailscale off, and shown on screen, so it
      // stays out of the console's warnings.
      console.debug("Sync failed", error)
      set({ ...state, failed: true })
    })
    .finally(() => (syncing = undefined))
  return syncing
}

export function startSync() {
  void sync()
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void sync()
  })
  setInterval(() => void sync(), 5 * 60 * 1000)
}
