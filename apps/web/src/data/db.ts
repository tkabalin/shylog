import { Dexie, type EntityTable } from "dexie"

import type { Log } from "@/api/client"

export type Dive = Log["dives"][number]
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
