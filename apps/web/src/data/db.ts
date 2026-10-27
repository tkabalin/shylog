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

// A dive's samples and events, fetched the first time its detail opens,
// with a digest of the figures the server keeps from them (see samples.ts),
// so a profile an import later replaces is fetched again.
export interface CachedProfile extends Profile {
  diveId: string
  digest: string
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
  cards!: EntityTable<Card, "id">
  meta!: Dexie.Table<Meta | Blocked, string>
  profiles!: EntityTable<CachedProfile, "diveId">

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
