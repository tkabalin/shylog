import { useSyncExternalStore } from "react"
import {
  diveFieldsSchema,
  entityFields,
  latestSchemaVersion,
} from "@shylog/core"

import { downloadCardImages, forgetCardUrls, warmCardImages } from "./cards"
import {
  db as defaultDb,
  type Card,
  type Dive,
  type DiveCentre,
  type DiveRows,
  type FieldMeta,
  type Link,
  type LogDb,
  type Meta,
  type Packing,
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
import { readMirror, type Mirror } from "./mirror"
import { downloadProfiles } from "./samples"
import { noteSynced, readLastSync } from "./last-sync"
import { upload } from "./upload"
import { syncLog } from "./sync"
import { NoAnswer, reportError } from "./client-log"

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
  // Missing until a sync brings it, so Edit can't save over the server's
  // list from a mirror written before the list existed.
  packing?: Packing
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
  // How the last sync went: unreachable when it got no answer (offline,
  // Tailscale off), fault when it failed with an answer (a server fault, a
  // refused login) or on the phone, which isn't Can't reach.
  reach: Reach
}

export type Reach = "ok" | "unreachable" | "fault"

// Worked out once per object. The mirror keeps unchanged rows, and maps of
// them, as the same objects from one version to the next, so what is made
// from them is the same too, and a screen memoised on it doesn't render.
function once<K extends object, V>(make: (key: K) => V) {
  const made = new WeakMap<K, V>()
  return (key: K) => {
    let value = made.get(key)
    if (value === undefined) made.set(key, (value = make(key)))
    return value
  }
}

const diveLinks = once(({ rows }: DiveRows<Link>) => {
  const links: DiveLinks = { buddies: [], professionals: [], tags: [] }
  for (const link of [...rows].sort((a, b) => a.position - b.position)) {
    const list =
      link.type === "buddy"
        ? links.buddies
        : link.type === "professional"
          ? links.professionals
          : links.tags
    list.push(link.target)
  }
  return links
})

const linksOf = once(
  (rows: Mirror["diveLinks"]) =>
    new Map([...rows].map(([diveId, group]) => [diveId, diveLinks(group)]))
)

const diveFieldMeta = once(
  ({ rows }: DiveRows<FieldMeta>) =>
    new Map(rows.map((row) => [row.field, row]))
)

const fieldMetaOf = once(
  (rows: Mirror["diveFieldMeta"]) =>
    new Map([...rows].map(([diveId, group]) => [diveId, diveFieldMeta(group)]))
)

// A card kept before places were (schema 3) goes last until the full sync
// the upgrade asks for, rather than unsorting the rest.
const cardsOf = once((cards: Mirror["cards"]) =>
  [...cards.values()].sort(
    (a, b) =>
      (a.position ?? Number.MAX_SAFE_INTEGER) -
      (b.position ?? Number.MAX_SAFE_INTEGER)
  )
)

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
    mandatoryStopEvents: 0,
    sampleDuration: null,
    sampleAverageDepth: null,
    safetyStop: null,
    deletedAt: null,
    draft: true,
    rejected: draft.rejected,
    savedAt: draft.createdAt,
  }
}

// Numbers dives as the server will once drafts upload (see derived.ts): by
// start time, ties to the one written first (refused drafts never are), so a
// synced dive after an earlier-dated draft moves up and no number shows twice.
// A synced dive is the mirror's own object, shared by every version that
// leaves it alone, so one whose number moves is copied, not changed.
function numberDrafts(dive: Map<string, Dive>) {
  const dives = [...dive.values()].filter((dive) => !dive.deletedAt)
  // With none, the server's numbers stand, and the sort is skipped.
  if (!dives.some((dive) => dive.draft)) return
  const counted = dives
    .filter((dive) => !dive.ignored && !dive.rejected)
    .sort(
      (a, b) =>
        a.startTime.localeCompare(b.startTime) ||
        Number(!!a.draft) - Number(!!b.draft) ||
        (a.number ?? 0) - (b.number ?? 0) ||
        (a.savedAt ?? "").localeCompare(b.savedAt ?? "")
    )
  counted.forEach((one, i) => {
    if (one.draft) one.provisional = i + 1
    else if (one.number !== i + 1) dive.set(one.id, { ...one, number: i + 1 })
  })
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

// The drafts to lay over the mirror. A queue that won't open (a newer app's
// schema) mustn't hide the log.
const readDrafts = (queue: QueueDb) =>
  listDrafts(queue).catch((error: unknown) => {
    console.warn("Couldn't read the drafts", error)
    return []
  })

// The mirror with the drafts laid over it. Only what a draft changes is
// copied: the rest is the mirror's own, never changed here.
function viewOf({ meta, ...mirror }: Mirror, drafts: Draft[]): LogView {
  // Shown, and opened, before they upload; a draft wins over a mirror row
  // with its id, which is the same dive edited since it uploaded.
  const dive = drafts.length ? new Map(mirror.dives) : mirror.dives
  for (const draft of drafts) {
    // One that newer code can't read (a schema change) mustn't hide the
    // whole log; it stays queued.
    try {
      dive.set(draft.id, draftDive(draft))
    } catch (error) {
      console.warn("Couldn't read a draft", draft.id, error)
    }
  }
  numberDrafts(dive)
  // Local wall-clock strings sort as dates. Ties take the server's
  // numbering, which follows the order they were written.
  const logged = [...dive.values()]
    .filter((dive) => !dive.deletedAt)
    .sort(
      (a, b) =>
        b.startTime.localeCompare(a.startTime) ||
        (b.number ?? b.provisional ?? 0) - (a.number ?? a.provisional ?? 0) ||
        b.id.localeCompare(a.id)
    )
  const links = linksOf(mirror.diveLinks)
  const entities = drafts.some((draft) => draft.entities.length)
  const fresh = <T>(map: Map<string, T>) => (entities ? new Map(map) : map)
  const log: LogView = {
    version: meta.version,
    settings: meta.settings,
    dives: logged,
    dive,
    sites: fresh(mirror.sites),
    regions: fresh(mirror.regions),
    people: fresh(mirror.people),
    diveCentres: fresh(mirror.diveCentres),
    trips: fresh(mirror.trips),
    links: drafts.length ? new Map(links) : links,
    fieldMeta: fieldMetaOf(mirror.diveFieldMeta),
    cards: cardsOf(mirror.cards),
    packing: meta.packing,
    pending: new Set(),
  }
  for (const draft of drafts) {
    const { id, fields } = draft
    log.links.set(id, {
      buddies: fields.buddies ?? [],
      professionals: fields.diveProfessionals ?? [],
      tags: fields.tags ?? [],
    })
    try {
      addEntities(log, draft)
    } catch (error) {
      console.warn("Couldn't read a draft's entities", draft.id, error)
    }
  }
  return log
}

export async function readLog(
  db: LogDb = defaultDb,
  queue: QueueDb = defaultQueue
): Promise<LogState> {
  // Drafts before the copy: an upload writes the log before it drops the
  // draft, so a read between the two still finds the dive in one of them.
  const drafts = await readDrafts(queue)
  const { mirror, blocked } = await readMirror(db)
  // A flag an updated app now understands no longer blocks, as in syncLog.
  return {
    loaded: true,
    reach: "ok",
    blocked: !!blocked && blocked.schemaVersion > latestSchemaVersion,
    log: mirror ? viewOf(mirror, drafts) : null,
  }
}

let state: LogState = {
  log: null,
  loaded: false,
  blocked: false,
  reach: "ok",
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

function setLog(next: LogState, db: LogDb) {
  set(next)
  if (next.log) {
    forgetCardUrls(next.log.cards)
    warmCardImages(next.log.cards, { db })
  }
}

// A failed read still marks the log loaded, so the screens can say so
// instead of staying blank, and the next sync tries again.
export async function loadLog(
  db: LogDb = defaultDb,
  queue: QueueDb = defaultQueue
) {
  try {
    setLog({ ...(await readLog(db, queue)), reach: state.reach }, db)
  } catch (error) {
    console.warn("Couldn't read the log copy", error)
    set({ ...state, loaded: true })
  }
}

// A log a sync fetched, shown before it is written. It came from a server
// on a schema this app knows, so the write clears any block. One that
// can't be shown is still written, and the read after it says so.
async function showLog(mirror: Mirror, current: () => Promise<boolean>) {
  try {
    // Drafts before the check, as in readLog: an upload writes its log
    // before it drops the draft, so the dive is in one of the two.
    const drafts = await readDrafts(defaultQueue)
    if (!(await current())) return
    setLog(
      { ...state, loaded: true, blocked: false, log: viewOf(mirror, drafts) },
      defaultDb
    )
  } catch (error) {
    console.warn("Couldn't show the fetched log", error)
  }
}

// Whether memory is behind the mirror, after a read that failed or a sync
// in another tab.
async function behind(db: LogDb = defaultDb) {
  const meta = (await db.meta.get("log")) as Meta | undefined
  return state.log?.version !== meta?.version
}

// The wait before a retry: 5 s, doubling to the five-minute check.
export const retryDelay = (failures: number) =>
  Math.min(5000 * 2 ** (failures - 1), 5 * 60 * 1000)

let syncing: Promise<void> | undefined
let failures = 0
let retry: ReturnType<typeof setTimeout> | undefined

function setReach(reach: Reach) {
  if (state.reach !== reach) set({ ...state, reach })
}

// A sync or upload got an answer, so the retries stop. One that fetched
// the log clears a fault too; an upload the server only refused fetched
// nothing, so a fault a sync met still stands.
export function noteReached(synced: boolean) {
  failures = 0
  clearTimeout(retry)
  if (synced || state.reach === "unreachable") setReach("ok")
}

// A sync failed with an answer, or on the phone. Asking again within
// seconds would only repeat it, so the five-minute check, coming back to
// the app or Try again asks next.
function noteFault() {
  failures = 0
  clearTimeout(retry)
  setReach("fault")
}

// A sync or upload got no answer. With a connection that is the server
// out of reach (Tailscale off, say), so it is tried again soon, backing off
// to the five-minute check. Offline it says nothing of the server, and
// would flash Can't reach on reconnecting; the online event tries instead.
export function noteUnreachable() {
  clearTimeout(retry)
  if (!navigator.onLine) return
  // An earlier fault is over: the server no longer answers at all.
  setReach("unreachable")
  failures += 1
  retry = setTimeout(() => void sync(), retryDelay(failures))
}

// A sync the diver or the phone asked for: the backoff starts again, so a
// long outage earlier doesn't leave the next retry minutes away.
export function syncNow() {
  failures = 0
  clearTimeout(retry)
  return sync()
}

// Syncs now, then whenever the app comes back to the foreground or online,
// and every five minutes while it is open, as the spec's version check
// does. A 304 costs one small request.
export function sync() {
  syncing ??= syncLog({ show: showLog })
    .then(async (result) => {
      noteReached(true)
      // A newer server took nothing, so the last sync stays the last real one.
      if (result !== "blocked") await noteSynced()
      // A fetched log is already in memory. Another tab's sync, which wins
      // over this one's write, or an earlier read that failed leaves memory
      // behind the mirror.
      if (await behind()) await loadLog()
      if (result === "blocked" && !state.blocked)
        set({ ...state, blocked: true })
      // Every dive's profile on the phone, so charts open at once offline;
      // not from a server whose schema this app doesn't understand.
      if (state.log && result !== "blocked") {
        void downloadProfiles([...state.log.dive.values()])
        // Every card's pages too, so they open with no signal.
        void downloadCardImages(state.log.cards)
        // A draft whose upload failed earlier, or whose acceptance wasn't
        // seen, goes again now the server answers.
        void upload()
      }
    })
    .catch(async (error: unknown) => {
      // Expected offline, with Tailscale off or from a failing server, and
      // shown on screen, so it stays out of the console's warnings.
      console.debug("Sync failed", error)
      // Not when there was no answer at all, which is Can't reach, and
      // which a report couldn't get through either.
      if (!(error instanceof NoAnswer)) void reportError("sync", error)
      // Anything else, a fault the server answered with or one on the phone,
      // would only repeat on a quick retry, and isn't Can't reach.
      if (error instanceof NoAnswer) noteUnreachable()
      else noteFault()
      // A write that failed after the fetched log was shown (a full phone)
      // leaves memory ahead of what the phone keeps and a relaunch shows.
      if (await behind().catch(() => false)) await loadLog()
    })
    .finally(() => (syncing = undefined))
  return syncing
}

export function startSync() {
  // The last sync kept from an earlier launch, once.
  void readLastSync().catch(() => {})
  void sync()
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncNow()
  })
  // Back online, an earlier Can't reach says nothing yet; the sync decides.
  window.addEventListener("online", () => {
    if (state.reach === "unreachable") setReach("ok")
    void syncNow()
  })
  setInterval(() => void sync(), 5 * 60 * 1000)
}
