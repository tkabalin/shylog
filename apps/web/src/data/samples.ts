import { apiClient, type Profile } from "@/api/client"

import { db as defaultDb, type Dive, type LogDb } from "./db"

// Offline before a profile was ever kept, the server unreachable, or the
// chart's chunk missing, as opposed to a profile that fails to draw.
export class LoadFailed extends Error {}

// One request per dive and profile, shared by the route loader's prefetch
// and the chart, which reads the same promise with React's use(). Kept for
// the dives opened most recently, newest last.
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

// Marks the promise with its outcome as React's use() reads it, so a
// profile already in hand renders at once instead of suspending a frame.
function settled<T>(promise: Promise<T>) {
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
}
