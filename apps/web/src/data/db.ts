import { Dexie, type EntityTable } from "dexie"

import type { Log, Profile } from "@/api/client"

// A draft that hasn't uploaded is shown as a dive too, with the server's
// reason if it refused it, when it was saved, and the number the server
// will give it (see readLog).
export type Dive = Log["dives"][number] & {
  draft?: true
  rejected?: string
  savedAt?: string
  provisional?: number
}
export type Site = Log["sites"][number]
export type Region = Log["regions"][number]
export type Person = Log["people"][number]
export type DiveCentre = Log["diveCentres"][number]
export type Trip = Log["trips"][number]
export type Link = Log["links"][number]
export type FieldMeta = Log["fieldMeta"][number]
// A dive's links, or its fields' sources, kept as one row. IndexedDB's cost
// is per row, and one per link and field made about twenty a dive, most of
// the time a sync took to write the log and a launch to read it.
export interface DiveRows<T> {
  diveId: string
  rows: T[]
}
export type Card = Log["cards"][number]
// Kept with its place in the list, as the table orders rows by id.
export type StoredCard = Card & { position: number }
export type Settings = Log["settings"]
export type Packing = Log["packing"]

// What the mirror knows about itself: the version it holds (its ETag), the
// server's schema version and time then, the log-wide settings and the
// packing checklist (missing from a mirror written before it existed).
export interface Meta {
  key: "log"
  version: string
  schemaVersion: number
  serverTime: string
  settings: Settings
  packing?: Packing
}

// A newer schemaVersion than this app understands stops syncing until the
// app is updated (see Client data in the spec). The version it came with
// lets later checks ask the server cheaply whether that is still so.
export interface Blocked {
  key: "blocked"
  schemaVersion: number
  version: string
}

// When the last sync reached the server, for the You tab: kept apart from
// the log's own meta, which a 304 leaves untouched.
export interface Synced {
  key: "synced"
  at: string
}

// Moved by every write to the kept profiles, in any tab, so a download can
// tell whether what it last read of them still holds (see samples.ts).
export interface ProfilesMark {
  key: "profiles"
  mark: number
}

// A dive's samples and events, fetched the first time its detail opens,
// with a digest of the figures the server keeps from them (see samples.ts),
// so a profile an import later replaces is fetched again.
export interface CachedProfile extends Profile {
  diveId: string
  digest: string
}

// A card's page as fetched, under the hash the log names it by, so a page
// that changed is a new row and one that didn't is never fetched again.
export interface CardImage {
  cardId: string
  hash: string
  blob: Blob
  // Until when a save keeps it from pruning, before its log names it.
  heldUntil?: number
}

// One table per collection of /api/log, mirroring it, so the log reads
// offline. Bump the version when a table or index changes.
export class LogDb extends Dexie {
  dives!: EntityTable<Dive, "id">
  sites!: EntityTable<Site, "id">
  countries!: EntityTable<{ code: string }, "code">
  regions!: EntityTable<Region, "id">
  people!: EntityTable<Person, "id">
  diveCentres!: EntityTable<DiveCentre, "id">
  trips!: EntityTable<Trip, "id">
  diveLinks!: EntityTable<DiveRows<Link>, "diveId">
  diveFieldMeta!: EntityTable<DiveRows<FieldMeta>, "diveId">
  cards!: EntityTable<StoredCard, "id">
  meta!: Dexie.Table<Meta | Blocked | Synced | ProfilesMark, string>
  profiles!: EntityTable<CachedProfile, "diveId">
  cardImages!: Dexie.Table<CardImage, [string, string]>

  constructor(name = "shylog") {
    super(name)
    this.version(1).stores({
      dives: "id",
      sites: "id",
      countries: "code",
      regions: "id",
      people: "id",
      diveCentres: "id",
      trips: "id",
      links: "[diveId+type+target]",
      fieldMeta: "[diveId+field]",
      cards: "id",
      meta: "key",
    })
    this.version(2).stores({ profiles: "diveId" })
    // The digest as an index too, so the background download can see which
    // profiles are kept, and which are stale, without reading any samples.
    this.version(3).stores({ profiles: "diveId, [diveId+digest]" })
    // Cards kept before this have no place in the list, and an unchanged
    // server answers 304, so the next sync is made to fetch the whole log.
    this.version(4)
      .stores({ cardImages: "[cardId+hash], heldUntil" })
      .upgrade((tx) => tx.table("meta").update("log", { version: "" }))
    // Likewise for the packing checklist, which an unchanged log's 304
    // would never bring.
    this.version(5)
      .stores({})
      .upgrade((tx) => tx.table("meta").update("log", { version: "" }))
    // Links and field sources as one row per dive. A table's key can't
    // change, so they move to new tables, grouped here so the log still
    // reads offline before the full sync the cleared version asks for.
    this.version(6)
      .stores({
        links: null,
        fieldMeta: null,
        diveLinks: "diveId",
        diveFieldMeta: "diveId",
      })
      .upgrade(async (tx) => {
        const [links, fieldMeta] = await Promise.all([
          tx.table<Link>("links").toArray(),
          tx.table<FieldMeta>("fieldMeta").toArray(),
        ])
        await Promise.all([
          tx.table("diveLinks").bulkPut(byDive(links)),
          tx.table("diveFieldMeta").bulkPut(byDive(fieldMeta)),
          tx.table("meta").update("log", { version: "" }),
        ])
      })
  }
}

export const db = new LogDb()

// The collections in the order /api/log sends them, for a write or a read
// of the whole mirror.
export const collections = [
  "dives",
  "sites",
  "countries",
  "regions",
  "people",
  "diveCentres",
  "trips",
  "diveLinks",
  "diveFieldMeta",
  "cards",
] as const

// The log's rows for every dive as one row each, in the order they came.
export function byDive<T extends { diveId: string }>(rows: readonly T[]) {
  const grouped = new Map<string, DiveRows<T>>()
  for (const row of rows) {
    const group = grouped.get(row.diveId)
    if (group) group.rows.push(row)
    else grouped.set(row.diveId, { diveId: row.diveId, rows: [row] })
  }
  return [...grouped.values()]
}
