import { Dexie, type EntityTable } from "dexie"

import type { Log, Profile } from "@/api/client"

// A draft that hasn't uploaded is shown as a dive too, with the server's
// reason if it refused it (see readLog).
export type Dive = Log["dives"][number] & { draft?: true; rejected?: string }
export type Site = Log["sites"][number]
export type Region = Log["regions"][number]
export type Person = Log["people"][number]
export type DiveCentre = Log["diveCentres"][number]
export type Trip = Log["trips"][number]
export type Link = Log["links"][number]
export type FieldMeta = Log["fieldMeta"][number]
export type Card = Log["cards"][number]
// Kept with its place in the list, as the table orders rows by id.
export type StoredCard = Card & { position: number }
export type Settings = Log["settings"]

// What the mirror knows about itself: the version it holds (its ETag), the
// server's schema version and time then, and the log-wide settings.
export interface Meta {
  key: "log"
  version: string
  schemaVersion: number
  serverTime: string
  settings: Settings
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
  links!: Dexie.Table<Link, [string, string, string]>
  fieldMeta!: Dexie.Table<FieldMeta, [string, string]>
  cards!: EntityTable<StoredCard, "id">
  meta!: Dexie.Table<Meta | Blocked | Synced, string>
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
  "links",
  "fieldMeta",
  "cards",
] as const
