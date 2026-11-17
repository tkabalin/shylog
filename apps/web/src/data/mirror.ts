import type { Table } from "dexie"

import type { Log } from "@/api/client"

import {
  byDive,
  collections,
  type Blocked,
  type Dive,
  type DiveCentre,
  type DiveRows,
  type FieldMeta,
  type Link,
  type LogDb,
  type Meta,
  type Person,
  type Region,
  type Site,
  type StoredCard,
  type Trip,
} from "./db"
import { pruneCardImages } from "./cards"
import { dropProfiles, pruneProfiles } from "./samples"

// The mirror's tables held in memory, each row under its key, as IndexedDB
// holds them at meta.version.
export interface Mirror {
  meta: Meta
  dives: Map<string, Dive>
  sites: Map<string, Site>
  countries: Map<string, { code: string }>
  regions: Map<string, Region>
  people: Map<string, Person>
  diveCentres: Map<string, DiveCentre>
  trips: Map<string, Trip>
  diveLinks: Map<string, DiveRows<Link>>
  diveFieldMeta: Map<string, DiveRows<FieldMeta>>
  cards: Map<string, StoredCard>
}

type Collection = (typeof collections)[number]
type Rows = {
  [K in Collection]: Mirror[K] extends Map<string, infer T> ? T[] : never
}

// Each table's primary key, as db.ts declares it.
const keys: { [K in Collection]: string } = {
  dives: "id",
  sites: "id",
  countries: "code",
  regions: "id",
  people: "id",
  diveCentres: "id",
  trips: "id",
  diveLinks: "diveId",
  diveFieldMeta: "diveId",
  cards: "id",
}

// Any collection's table, untyped, so one loop can write them all.
const tableOf = (db: LogDb, name: Collection) => db[name] as unknown as Table

// The last copy this tab read from or wrote to each database. A write
// compares the new log with it, and a read at the same version skips
// IndexedDB, so a sync, an upload or a saved draft never reads it back.
const kept = new WeakMap<LogDb, Mirror>()

// Whether two rows, as JSON or IndexedDB gives them, hold the same values.
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false
    return true
  }
  if (Array.isArray(b)) return false
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const names = Object.keys(left)
  if (names.length !== Object.keys(right).length) return false
  for (const name of names)
    if (!Object.hasOwn(right, name) || !same(left[name], right[name]))
      return false
  return true
}

// Each table's rows by key, every row equal to the last copy's taken from
// it, and the last copy's map itself if nothing changed. Screens then get
// the same objects for what didn't change, and a write finds what did.
function mirrorOf(meta: Meta, rows: Rows, last: Mirror | undefined): Mirror {
  const table = <K extends Collection>(name: K) => {
    const before = last?.[name] as Map<string, unknown> | undefined
    const now = new Map<string, unknown>()
    let changed = rows[name].length !== before?.size
    const keyOf = (row: Record<string, unknown>) => row[keys[name]] as string
    // In key order, as IndexedDB returns them, so a map lists its rows the
    // same way after a sync as after a launch: pickers break ties by it.
    const sorted = [...(rows[name] as Record<string, unknown>[])].sort(
      (a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0)
    )
    for (const row of sorted) {
      const key = keyOf(row)
      const old = before?.get(key)
      if (old !== undefined && same(old, row)) now.set(key, old)
      else {
        now.set(key, row)
        changed = true
      }
    }
    return (changed ? now : before) as Mirror[K]
  }
  return {
    meta,
    dives: table("dives"),
    sites: table("sites"),
    countries: table("countries"),
    regions: table("regions"),
    people: table("people"),
    diveCentres: table("diveCentres"),
    trips: table("trips"),
    diveLinks: table("diveLinks"),
    diveFieldMeta: table("diveFieldMeta"),
    cards: table("cards"),
  }
}

// A log as fetched, as the mirror keeps it.
export const fetchedMirror = (db: LogDb, log: Log) =>
  mirrorOf(
    {
      key: "log",
      version: log.version,
      schemaVersion: log.schemaVersion,
      serverTime: log.serverTime,
      settings: log.settings,
      packing: log.packing,
    },
    {
      dives: log.dives,
      sites: log.sites,
      countries: log.countries.map((code) => ({ code })),
      regions: log.regions,
      people: log.people,
      diveCentres: log.diveCentres,
      trips: log.trips,
      diveLinks: byDive(log.links),
      diveFieldMeta: byDive(log.fieldMeta),
      cards: log.cards.map((card, position) => ({ ...card, position })),
    },
    kept.get(db)
  )

// The mirror and its blocked flag, read in one transaction. Only the meta
// row when this tab already holds that version.
export function readMirror(db: LogDb) {
  return db.transaction("r", db.tables, async () => {
    const [meta, blocked] = await Promise.all([
      db.meta.get("log") as Promise<Meta | undefined>,
      db.meta.get("blocked") as Promise<Blocked | undefined>,
    ])
    if (!meta) return { blocked }
    const last = kept.get(db)
    // An upgrade clears the version, and its rows are worth reading again.
    if (meta.version && last?.meta.version === meta.version)
      return { mirror: last, blocked }
    const read = await Promise.all(
      collections.map((name) => tableOf(db, name).toArray())
    )
    const rows = Object.fromEntries(
      collections.map((name, i) => [name, read[i]])
    ) as Rows
    const mirror = mirrorOf(meta, rows, last)
    kept.set(db, mirror)
    return { mirror, blocked }
  })
}

// Writes a fetched log in one transaction: the rows that changed when
// IndexedDB holds this tab's last copy, else every table. Nothing, and
// false, once an upload or another tab has written since `expected`.
export async function writeMirror(
  db: LogDb,
  next: Mirror,
  expected: string | undefined
) {
  const written = await db.transaction(
    "rw",
    [...collections, "meta", "profiles", "cardImages"],
    async () => {
      const now = (await db.meta.get("log")) as Meta | undefined
      if (now?.version !== expected) return false
      const last = kept.get(db)
      await Promise.all([
        now?.version && last?.meta.version === now.version
          ? writeChanges(db, last, next)
          : replace(db, next),
        pruneCardImages(db, [...next.cards.values()]),
        db.meta.delete("blocked"),
        db.meta.put(next.meta),
      ])
      return true
    }
  )
  if (written) kept.set(db, next)
  return written
}

async function writeChanges(db: LogDb, last: Mirror, next: Mirror) {
  const writes: Promise<unknown>[] = []
  for (const name of collections) {
    const before = last[name] as Map<string, unknown>
    const now = next[name] as Map<string, unknown>
    if (before === now) continue
    const put = [...now].filter(([key, row]) => before.get(key) !== row)
    const gone = [...before.keys()].filter((key) => !now.has(key))
    if (put.length)
      writes.push(tableOf(db, name).bulkPut(put.map(([, row]) => row)))
    if (gone.length) writes.push(tableOf(db, name).bulkDelete(gone))
    // The kept profiles of dives the log no longer has.
    if (name === "dives" && gone.length) writes.push(dropProfiles(db, gone))
  }
  await Promise.all(writes)
}

async function replace(db: LogDb, next: Mirror) {
  await Promise.all(collections.map((name) => tableOf(db, name).clear()))
  await Promise.all([
    ...collections.map((name) =>
      tableOf(db, name).bulkPut([
        ...(next[name] as Map<string, unknown>).values(),
      ])
    ),
    pruneProfiles(db, new Set(next.dives.keys())),
  ])
}
