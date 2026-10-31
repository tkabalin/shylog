import { useSyncExternalStore } from "react"
import {
  diveFieldsSchema,
  entityFields,
  latestSchemaVersion,
} from "@shylog/core"

import { downloadCardImages, forgetCardUrls, warmCardImages } from "./cards"
import {
  db as defaultDb,
  type Blocked,
  type Card,
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
import {
  listDrafts,
  queue as defaultQueue,
  type Draft,
  type QueueDb,
} from "./drafts"
import { downloadProfiles } from "./samples"
import { noteSynced, readLastSync } from "./last-sync"
import { upload } from "./upload"
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
  // Certification cards in the server's order.
  cards: Card[]
  // Entities only a draft has created, which the server doesn't know yet,
  // so they can't be renamed, merged or deleted.
  pending: Set<string>
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

// Fields a dive row doesn't carry: the lists are links, and the interval
// is set below.
const apart = [
  "buddies",
  "diveProfessionals",
  "tags",
  "surfaceInterval",
] as const

// A draft as the log sends a dive: no number, and nothing the server
// derives yet. Parsed for the defaults; keys the form left undefined are
// dropped so they read as null.
function draftDive(draft: Draft): Dive {
  const parsed = diveFieldsSchema.parse(draft.fields)
  const { surfaceInterval } = parsed
  const fields = Object.fromEntries(
    Object.entries(parsed).filter(
      ([key, value]) =>
        value !== undefined && !(apart as readonly string[]).includes(key)
    )
  ) as Omit<typeof parsed, (typeof apart)[number]>
  return {
    trainingAgency: null,
    trainingCourse: null,
    tripId: null,
    diveCentreId: null,
    entry: null,
    current: null,
    surge: null,
    surface: null,
    weather: null,
    minTemperature: null,
    maxTemperature: null,
    visibility: null,
    visibilityRating: null,
    workload: null,
    thermalComfort: null,
    averageDepth: null,
    weight: null,
    cylinderMaterial: null,
    cylinderVolume: null,
    oxygen: null,
    startPressure: null,
    endPressure: null,
    notableAnimals: null,
    gearDetails: null,
    notes: null,
    ...fields,
    id: draft.id,
    number: null,
    // As the log sends a dive with no override until the server works the
    // interval out.
    surfaceInterval: surfaceInterval ?? "none",
    surfaceIntervalOverride: surfaceInterval !== undefined,
    computerModel: null,
    cns: null,
    otu: null,
    sparkline: null,
    ascentAlarmCount: 0,
    sampleDuration: null,
    sampleAverageDepth: null,
    deletedAt: null,
    draft: true,
    rejected: draft.rejected,
  }
}

// The entities a draft creates, as the log sends them. One the copy already
// has is left as the server has it.
function addEntities(log: LogView, draft: Draft) {
  for (const entity of draft.entities) {
    const { id } = entity
    const map = {
      site: log.sites,
      region: log.regions,
      diveCentre: log.diveCentres,
      person: log.people,
      trip: log.trips,
    }[entity.kind]
    if (!map.has(id)) log.pending.add(id)
    if (entity.kind === "site") {
      const site = entityFields.site.parse(entity.fields)
      if (!log.sites.has(id))
        log.sites.set(id, {
          id,
          ...site,
          regionId: site.regionId ?? null,
          bodyOfWater: site.bodyOfWater ?? null,
        })
    } else if (entity.kind === "region") {
      if (!log.regions.has(id))
        log.regions.set(id, { id, ...entityFields.region.parse(entity.fields) })
    } else if (entity.kind === "diveCentre") {
      const centre = entityFields.diveCentre.parse(entity.fields)
      if (!log.diveCentres.has(id))
        log.diveCentres.set(id, {
          id,
          ...centre,
          regionId: centre.regionId ?? null,
        })
    } else if (entity.kind === "person") {
      if (!log.people.has(id))
        log.people.set(id, { id, ...entityFields.person.parse(entity.fields) })
    } else if (!log.trips.has(id)) {
      log.trips.set(id, { id, ...entityFields.trip.parse(entity.fields) })
    }
  }
}

export async function readLog(
  db: LogDb = defaultDb,
  queue: QueueDb = defaultQueue
): Promise<LogState> {
  // Drafts before the copy: an upload writes the log before it drops the
  // draft, so a read between the two still finds the dive in one of them.
  // A queue that won't open (a newer app's schema) mustn't hide the log.
  const drafts = await listDrafts(queue).catch((error: unknown) => {
    console.warn("Couldn't read the drafts", error)
    return []
  })
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
    const [
      dives,
      sites,
      regions,
      people,
      centres,
      trips,
      links,
      fieldMeta,
      cards,
    ] = await Promise.all([
      db.dives.toArray(),
      db.sites.toArray(),
      db.regions.toArray(),
      db.people.toArray(),
      db.diveCentres.toArray(),
      db.trips.toArray(),
      db.links.toArray(),
      db.fieldMeta.toArray(),
      db.cards.toArray(),
    ])
    // Shown, and opened, before they upload; a draft wins over a mirror row
    // with its id, which is the same dive edited since it uploaded.
    const dive = byId(dives)
    for (const draft of drafts) {
      // One that newer code can't read (a schema change) mustn't hide the
      // whole log; it stays queued.
      try {
        dive.set(draft.id, draftDive(draft))
      } catch (error) {
        console.warn("Couldn't read a draft", draft.id, error)
      }
    }
    const logged = [...dive.values()]
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
    for (const { id, fields } of drafts) {
      linkMap.set(id, {
        buddies: fields.buddies ?? [],
        professionals: fields.diveProfessionals ?? [],
        tags: fields.tags ?? [],
      })
    }
    const metaMap = new Map<string, Map<string, FieldMeta>>()
    for (const row of fieldMeta) {
      if (!metaMap.has(row.diveId)) metaMap.set(row.diveId, new Map())
      metaMap.get(row.diveId)!.set(row.field, row)
    }
    const log: LogView = {
      version: meta.version,
      settings: meta.settings,
      dives: logged,
      dive,
      sites: byId(sites),
      regions: byId(regions),
      people: byId(people),
      diveCentres: byId(centres),
      trips: byId(trips),
      links: linkMap,
      fieldMeta: metaMap,
      // A card kept before places were (schema 3) goes last until the full
      // sync the upgrade asks for, rather than unsorting the rest.
      cards: cards.sort(
        (a, b) =>
          (a.position ?? Number.MAX_SAFE_INTEGER) -
          (b.position ?? Number.MAX_SAFE_INTEGER)
      ),
      pending: new Set(),
    }
    for (const draft of drafts) {
      try {
        addEntities(log, draft)
      } catch (error) {
        console.warn("Couldn't read a draft's entities", draft.id, error)
      }
    }
    return { ...state, log }
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
export async function loadLog(
  db: LogDb = defaultDb,
  queue: QueueDb = defaultQueue
) {
  try {
    set({ ...(await readLog(db, queue)), failed: state.failed })
    if (state.log) {
      forgetCardUrls(state.log.cards)
      warmCardImages(state.log.cards, { db })
    }
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
      // A newer server took nothing, so the last sync stays the last real one.
      if (result !== "blocked") await noteSynced()
      if (result === "updated" || (await behind())) await loadLog()
      if (result === "blocked" && !state.blocked)
        set({ ...state, blocked: true })
      // Every dive's profile on the phone, so charts open at once offline;
      // not from a server whose schema this app doesn't understand.
      if (state.log && result !== "blocked") {
        void downloadProfiles([...state.log.dive.values()])
        // Every card's pages too, so they open with no signal.
        void downloadCardImages(state.log.cards)
        // A draft whose upload failed earlier, or whose acceptance wasn't
        // seen, goes again now the server answers. Full retry comes with
        // the offline work.
        void upload()
      }
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
  // The last sync kept from an earlier launch, once.
  void readLastSync().catch(() => {})
  void sync()
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void sync()
  })
  setInterval(() => void sync(), 5 * 60 * 1000)
}
