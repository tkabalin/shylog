import { samplesBatch } from "@shylog/core"

import { apiClient, type Profile } from "@/api/client"

import { db as defaultDb, type Dive, type LogDb } from "./db"

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

// The figures the server keeps from a dive's samples: its sparkline, alarm
// count and SAC's sample figures. A re-import that changes the samples
// changes at least one of them, so a stale copy is fetched again.
const digest = (dive: Dive) =>
  JSON.stringify([
    dive.sparkline,
    dive.ascentAlarmCount,
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
// hand draws on the card's first render.
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
  db.profiles
    .put({ diveId: dive.id, digest: key, samples, events })
    .catch(() => {})
  return { samples, events }
}

// After a sync: fetches, 25 dives a request, the profiles of every dive with
// samples that the phone doesn't keep yet or keeps under an older digest, so
// every chart opens at once and works offline. A batch the server refuses is
// skipped; losing the connection ends the run, and the next sync tries again.
type DownloadOptions = { db?: LogDb; fetch?: typeof globalThis.fetch }
let downloading: Promise<void> | undefined
let next: [readonly Dive[], DownloadOptions] | undefined
// Set once a write fails with the phone's storage full: every later run
// would fetch the same batch only to drop it. Other failures retry next sync.
let full = false
// Dexie reports a full disk as an abort's inner error, a mock as itself.
const isQuota = (error: unknown): boolean =>
  error instanceof Object &&
  ((error as { name?: unknown }).name === "QuotaExceededError" ||
    isQuota((error as { inner?: unknown }).inner))
export function downloadProfiles(
  dives: readonly Dive[],
  options: DownloadOptions = {}
) {
  if (full) return Promise.resolve()
  // One run at a time; a sync during it leaves its newer list for another.
  next = [dives, options]
  downloading ??= (async () => {
    while (next && !full) {
      const run = next
      next = undefined
      await download(...run).catch((error: unknown) => {
        console.debug("Profile download stopped", error)
      })
    }
    // Cleared in the same step as the last check of `next`, so a list left
    // after it starts a new run rather than joining one that has ended.
    downloading = next = undefined
  })()
  return downloading
}

async function download(
  dives: readonly Dive[],
  { db = defaultDb, fetch }: DownloadOptions
) {
  const kept = new Set(
    (await db.profiles.orderBy("[diveId+digest]").keys()).map((key) =>
      String(key)
    )
  )
  // Each asked-for dive's digest, as the log had it when the run began.
  const asked = new Map<string, string>()
  for (const dive of dives) {
    const key = digest(dive)
    // Not for Recently deleted, which never draws one; a restore brings it.
    if (dive.sparkline && !dive.deletedAt && !kept.has(String([dive.id, key])))
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
    // Only for dives the log still has as they were: a sync since may have
    // pruned one or brought a new profile, which the next run fetches.
    await db
      .transaction("rw", db.dives, db.profiles, async () => {
        const now = await db.dives.bulkGet(Object.keys(profiles))
        await db.profiles.bulkPut(
          now.flatMap((dive) => {
            const key = dive && digest(dive)
            return key && key === asked.get(dive.id)
              ? [{ diveId: dive.id, digest: key, ...profiles[dive.id] }]
              : []
          })
        )
      })
      .catch((error: unknown) => {
        if (isQuota(error)) full = true
        throw error
      })
  }
}

// Drops the copies of dives the log no longer has, in the same transaction
// as a sync that writes the log. By key, so no profile's samples are read.
export const pruneProfiles = (db: LogDb, diveIds: ReadonlySet<string>) =>
  db.profiles
    .where("diveId")
    .noneOf([...diveIds])
    .delete()

// For the dev page's fixtures (routes/dev.profile.tsx): serves a profile, or
// one that never arrives, without a request.
export function primeProfile(dive: Dive, profile: Promise<Profile>) {
  loading.set(keyOf(dive), settled(profile))
}

// For tests: forget the requests, so each starts from the phone's copy.
export function forgetProfiles() {
  loading.clear()
  failed.clear()
  full = false
}
