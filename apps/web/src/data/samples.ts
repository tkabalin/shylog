import { samplesBatch } from "@shylog/core"

import { apiClient, type Profile } from "@/api/client"

import {
  db as defaultDb,
  type CachedProfile,
  type Dive,
  type LogDb,
  type ProfilesMark,
} from "./db"
import { downloader } from "./downloads"

// Offline before a profile was ever kept, the server unreachable, or the
// chart's chunk missing, as opposed to a profile that fails to draw.
export class LoadFailed extends Error {}

// One request per dive and profile, shared by the route loader's prefetch
// and the Profile card, which draws from it as soon as it settles. Kept
// for the dives opened most recently, newest last.
const loading = new Map<string, Promise<Profile>>()
const kept = 50
// A failure is kept until retried: React renders the chart again to show
// the error, and a fresh request on each render would loop.
const failed = new Set<string>()

// What the server keeps from a dive's samples and events (sparkline, alarm
// and mandatory stop counts, SAC's figures): a change to them changes one,
// so a stale copy is fetched again. The safety stop is read from the dive.
const digest = (dive: Dive) =>
  JSON.stringify([
    dive.sparkline,
    dive.ascentAlarmCount,
    dive.mandatoryStopEvents,
    dive.sampleDuration,
    dive.sampleAverageDepth,
  ])
// One per dive and profile: the card resets and remounts its chart on a
// change, so a failure is retried and the crosshair starts afresh.
export const profileKey = (dive: Dive) => `${dive.id} ${digest(dive)}`
const keyOf = profileKey

// A dive's samples and events: from the phone once fetched, otherwise from
// the server, then kept.
export function loadProfile(
  dive: Dive,
  {
    db = defaultDb,
    fetch,
  }: { db?: LogDb; fetch?: typeof globalThis.fetch } = {}
): Promise<Profile> {
  const key = keyOf(dive)
  let profile = loading.get(key)
  if (profile) {
    // Most recently used goes last, so the oldest is dropped first.
    loading.delete(key)
    loading.set(key, profile)
    return profile
  }
  for (const old of loading.keys()) {
    if (old.startsWith(`${dive.id} `)) forget(old)
  }
  profile = settled(readProfile(dive, db, fetch))
  loading.set(key, profile)
  // Only while still kept: a request already replaced or dropped would
  // leave a mark that makes a later retry drop a good copy.
  profile.catch(() => {
    if (loading.get(key) === profile) failed.add(key)
  })
  if (loading.size > kept) forget(loading.keys().next().value!)
  return profile
}

// Lets the next loadProfile try again after a failure: Try again, or
// opening the dive afresh.
export function retryProfile(dive: Dive) {
  const key = keyOf(dive)
  if (failed.has(key)) forget(key)
}

function forget(key: string) {
  loading.delete(key)
  failed.delete(key)
}

// What a load has come to, read without waiting, so a profile already in
// hand draws as soon as the page has painted, with no skeleton.
export type Settled<T> =
  | { status: "pending" }
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown }
export const outcome = <T>(promise: Promise<T>) =>
  promise as unknown as Settled<T>

// Marks the promise with its outcome (see `outcome`).
export function settled<T>(promise: Promise<T>) {
  const tracked = promise as Promise<T> & Record<string, unknown>
  tracked.status = "pending"
  // Blocks, not expressions: returning the promise itself from a handler
  // would chain its rejection into a new, unhandled one.
  promise.then(
    (value) => {
      Object.assign(tracked, { status: "fulfilled", value })
    },
    (reason: unknown) => {
      Object.assign(tracked, { status: "rejected", reason })
    }
  )
  return promise
}

async function readProfile(
  dive: Dive,
  db: LogDb,
  fetch?: typeof globalThis.fetch
): Promise<Profile> {
  const key = digest(dive)
  // A browser that refuses IndexedDB (a private window) still fetches.
  const cached = await db.profiles.get(dive.id).catch(() => undefined)
  if (cached?.digest === key) {
    return { samples: cached.samples, events: cached.events }
  }
  const res = await apiClient(fetch)
    .api.dives[":id"].samples.$get({ param: { id: dive.id } })
    .catch((cause: unknown) => {
      throw new LoadFailed("Couldn't reach Shylog", { cause })
    })
  if (!res.ok) throw new LoadFailed(`Couldn't load the profile (${res.status})`)
  const { samples, events } = await res.json()
  // Kept in the background: the chart needn't wait for the write.
  db.transaction("rw", [db.dives, db.profiles, db.meta], () =>
    keep(db, [{ diveId: dive.id, digest: key, samples, events }])
  )
    .then((wrote) => wrote && noteKept(db, wrote))
    .catch(() => {})
  return { samples, events }
}

// Every write to the kept profiles, in any tab, moves this mark in the same
// transaction, and a download keeps what it read of them under the mark it
// read with it, so it needn't read them again while the mark stays. Random,
// not counted, so a database made afresh can't come back to an old mark.
const markOf = async (db: LogDb) =>
  ((await db.meta.get("profiles")) as ProfilesMark | undefined)?.mark ?? 0
async function moveMark(db: LogDb) {
  const from = await markOf(db)
  const to = Math.random()
  await db.meta.put({ key: "profiles", mark: to })
  return { from, to }
}

// After a sync: fetches, 25 dives a request, the profiles of every dive with
// samples that the phone doesn't keep yet or keeps under an older digest, so
// every chart opens at once and works offline. A batch the server refuses is
// skipped; losing the connection ends the run, and the next sync tries again.
type DownloadOptions = { db?: LogDb; fetch?: typeof globalThis.fetch }
export const downloadProfiles = downloader(
  "Profile",
  (dives: readonly Dive[], options: DownloadOptions = {}) =>
    download(dives, options)
)

// Each kept profile's digest by dive, as a download last read them and under
// the mark it read with them. Reading every key took each sync tens of
// milliseconds of IndexedDB at 1000 dives, though a sync rarely changes one.
let stored = new WeakMap<
  LogDb,
  { mark: number; digests: Map<string, string> }
>()

// Puts the profiles of dives the mirror still has as they were, moving the
// mark, in the caller's transaction over dives, profiles and meta. A sync
// since may have removed the dive or changed its profile.
async function keep(db: LogDb, rows: CachedProfile[]) {
  const now = await db.dives.bulkGet(rows.map((row) => row.diveId))
  const current = rows.filter((row, i) => {
    const dive = now[i]
    return dive && digest(dive) === row.digest
  })
  if (!current.length) return
  await db.profiles.bulkPut(current)
  return { rows: current, ...(await moveMark(db)) }
}
// Once committed: with no other write between, what a download last read
// holds with this write's rows, so the next needn't read them again.
function noteKept(
  db: LogDb,
  wrote: NonNullable<Awaited<ReturnType<typeof keep>>>
) {
  const last = stored.get(db)
  if (last?.mark !== wrote.from) return
  last.mark = wrote.to
  for (const row of wrote.rows) last.digests.set(row.diveId, row.digest)
}

async function download(
  dives: readonly Dive[],
  { db = defaultDb, fetch }: DownloadOptions
) {
  const onPhone = await db.transaction("r", db.profiles, db.meta, async () => {
    const mark = await markOf(db)
    const last = stored.get(db)
    if (last?.mark === mark) return last
    const read = {
      mark,
      digests: new Map(
        (await db.profiles.orderBy("[diveId+digest]").keys()) as unknown as [
          string,
          string,
        ][]
      ),
    }
    stored.set(db, read)
    return read
  })
  // Each asked-for dive's digest, as the log had it when the run began.
  const asked = new Map<string, string>()
  for (const dive of dives) {
    const key = digest(dive)
    // Not for Recently deleted, which never draws one; a restore brings it.
    if (
      dive.sparkline &&
      !dive.deletedAt &&
      onPhone.digests.get(dive.id) !== key
    )
      asked.set(dive.id, key)
  }
  const missing = [...asked.keys()]
  for (let i = 0; i < missing.length; i += samplesBatch) {
    const ids = missing.slice(i, i + samplesBatch)
    const res = await apiClient(fetch).api.samples.$get({
      query: { ids: ids.join(",") },
    })
    if (!res.ok) {
      console.debug(`Couldn't download profiles (${res.status})`)
      continue
    }
    const { profiles } = await res.json()
    // Under the digest asked for: one a sync has changed since is fetched by
    // the next run.
    const wrote = await db.transaction(
      "rw",
      [db.dives, db.profiles, db.meta],
      () =>
        keep(
          db,
          Object.entries(profiles).flatMap(([diveId, profile]) => {
            const key = asked.get(diveId)
            return key ? [{ diveId, digest: key, ...profile }] : []
          })
        )
    )
    if (wrote) noteKept(db, wrote)
  }
}

// Drops the copies of dives the log no longer has, in the same transaction
// as a sync that writes the log. By key, so no profile's samples are read,
// and the mark moves only if one went, as most syncs drop none.
export async function pruneProfiles(db: LogDb, diveIds: ReadonlySet<string>) {
  const dropped = await db.profiles
    .where("diveId")
    .noneOf([...diveIds])
    .delete()
  if (dropped) await moveMark(db)
}

// Drops the copies of the dives a sync removed from the log, likewise: a
// dive logged by hand has none, so may leave the mark where it is.
export async function dropProfiles(db: LogDb, diveIds: string[]) {
  const dropped = await db.profiles.where("diveId").anyOf(diveIds).delete()
  if (dropped) await moveMark(db)
}

// For the dev page's fixtures (routes/dev.profile.tsx): serves a profile, or
// one that never arrives, without a request.
export function primeProfile(dive: Dive, profile: Promise<Profile>) {
  loading.set(keyOf(dive), settled(profile))
}

// For tests: forget the requests, so each starts from the phone's copy.
export function forgetProfiles() {
  loading.clear()
  failed.clear()
  stored = new WeakMap()
  downloadProfiles.reset()
}
