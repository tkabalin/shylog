import type { McpServer } from "@modelcontextprotocol/server"
import {
  countryCodes,
  diveTypes,
  entityKinds,
  isUnknownSite,
  keysOf,
  matchesLogSearch,
  normaliseName,
  tags,
  type EntityKind,
} from "@shylog/core"
import { z } from "zod"

import { resolve } from "../../apply/entity.ts"
import { Rejected } from "../../apply/rejected.ts"
import type { Deps } from "../../factory.ts"
import { selectEvents } from "../../profile.ts"
import { readLog } from "../../routes/log.ts"
import { addTool, readHints as read } from "../tool.ts"
import {
  compact,
  diveDetail,
  diveRow,
  indexLog,
  linksOf,
  minutes,
  paged,
  profileOf,
  type Dive,
  type LogIndex,
} from "../view.ts"

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

const searchInput = z.strictObject({
  from: date.optional().describe("First day, YYYY-MM-DD, included"),
  to: date.optional().describe("Last day, YYYY-MM-DD, included"),
  numberFrom: z.int().positive().optional().describe("Lowest dive number"),
  numberTo: z.int().positive().optional().describe("Highest dive number"),
  siteId: z.string().optional(),
  regionId: z.string().optional(),
  countryCode: z.enum(countryCodes).optional(),
  tripId: z.string().optional(),
  diveCentreId: z.string().optional(),
  personId: z.string().optional().describe("A buddy or dive professional"),
  personRole: z
    .enum(["any", "buddy", "professional"])
    .default("any")
    .describe("The role personId had on the dive"),
  tags: z
    .array(z.enum(keysOf(tags)))
    .optional()
    .describe("Any of these"),
  diveType: z.enum(keysOf(diveTypes)).optional(),
  nitrox: z.boolean().optional(),
  minDepthM: z.number().optional(),
  maxDepthM: z.number().optional(),
  minDurationMin: z.number().optional(),
  maxDurationMin: z.number().optional(),
  text: z
    .string()
    .optional()
    .describe(
      "Found in the site's name, buddies' names, notable animals or notes, ignoring case and accents"
    ),
  includeDeleted: z
    .boolean()
    .default(false)
    .describe("Also dives in Recently deleted"),
  sort: z.enum(["newest", "oldest", "deepest", "longest"]).default("newest"),
  limit: z.int().min(1).max(200).default(50),
  offset: z.int().min(0).default(0),
})
type Search = z.output<typeof searchInput>

// The Log's own search, so Claude finds the dives the app would.
const matchesText = (index: LogIndex, dive: Dive, query: string) =>
  matchesLogSearch(query, {
    site: index.sites.get(dive.siteId)?.name,
    buddies: linksOf(index, dive).buddies.map(
      (id) => index.people.get(id)?.name
    ),
    notableAnimals: dive.notableAnimals,
    notes: dive.notes,
  })

function matches(index: LogIndex, dive: Dive, search: Search) {
  const day = dive.startTime.slice(0, 10)
  const site = index.sites.get(dive.siteId)
  const links = linksOf(index, dive)
  const minutesLong = dive.duration / 60
  const checks = [
    search.includeDeleted || dive.deletedAt == null,
    !search.from || day >= search.from,
    !search.to || day <= search.to,
    !search.numberFrom || (dive.number ?? 0) >= search.numberFrom,
    !search.numberTo || (dive.number != null && dive.number <= search.numberTo),
    !search.siteId || dive.siteId === search.siteId,
    !search.regionId || site?.regionId === search.regionId,
    !search.countryCode || site?.countryCode === search.countryCode,
    !search.tripId || dive.tripId === search.tripId,
    !search.diveCentreId || dive.diveCentreId === search.diveCentreId,
    !search.personId ||
      (search.personRole !== "professional" &&
        links.buddies.includes(search.personId)) ||
      (search.personRole !== "buddy" &&
        links.professionals.includes(search.personId)),
    !search.tags?.length || search.tags.some((tag) => links.tags.includes(tag)),
    !search.diveType || dive.diveType === search.diveType,
    search.nitrox === undefined || dive.nitrox === search.nitrox,
    search.minDepthM === undefined || dive.maxDepth >= search.minDepthM,
    search.maxDepthM === undefined || dive.maxDepth <= search.maxDepthM,
    search.minDurationMin === undefined || minutesLong >= search.minDurationMin,
    search.maxDurationMin === undefined || minutesLong <= search.maxDurationMin,
    !search.text || matchesText(index, dive, search.text),
  ]
  return checks.every(Boolean)
}

const orders = {
  newest: (a: Dive, b: Dive) => b.startTime.localeCompare(a.startTime),
  oldest: (a: Dive, b: Dive) => a.startTime.localeCompare(b.startTime),
  deepest: (a: Dive, b: Dive) => b.maxDepth - a.maxDepth,
  longest: (a: Dive, b: Dive) => b.duration - a.duration,
}

// The dive a number names, as the app shows it, or the one an id names.
function findDive(log: LogIndex, args: { number?: number; id?: string }) {
  if ((args.number === undefined) === (args.id === undefined)) {
    throw new Rejected("Give either a dive number or a dive id")
  }
  const dives = log.log.dives
  if (args.id !== undefined) {
    const dive = dives.find((d) => d.id === args.id)
    if (!dive) throw new Rejected("No dive has that id", 404)
    return dive
  }
  const dive = dives.find((d) => d.number === args.number)
  if (!dive) {
    const last = Math.max(0, ...dives.map((d) => d.number ?? 0))
    throw new Rejected(
      last
        ? `No dive is numbered ${args.number}: the log runs from 1 to ${last}`
        : "The log has no numbered dives yet",
      404
    )
  }
  return dive
}

// Whether a dive counts towards an entity's figures, as You counts them:
// not ignored, and not in Recently deleted.
const counted = (dive: Dive) => !dive.ignored && dive.deletedAt == null

// The entities of a kind a dive is on.
function entitiesOf(index: LogIndex, kind: EntityKind, dive: Dive) {
  switch (kind) {
    case "site":
      return [dive.siteId]
    case "region":
      return [index.sites.get(dive.siteId)?.regionId]
    case "person": {
      const links = linksOf(index, dive)
      return new Set([...links.buddies, ...links.professionals])
    }
    case "diveCentre":
      return [dive.diveCentreId]
    case "trip":
      return [dive.tripId]
  }
}

function entityRows(index: LogIndex, kind: EntityKind, name?: string) {
  const { log } = index
  const rows = {
    site: log.sites,
    region: log.regions,
    person: log.people,
    diveCentre: log.diveCentres,
    trip: log.trips,
  }[kind] as { id: string; name: string }[]
  const needle = name === undefined ? "" : normaliseName(name)
  // Each entity's dives, from one pass over the log.
  const divesOf = new Map<string, Dive[]>()
  for (const dive of log.dives) {
    for (const id of entitiesOf(index, kind, dive)) {
      if (!id) continue
      const dives = divesOf.get(id)
      if (dives) dives.push(dive)
      else divesOf.set(id, [dive])
    }
  }
  return rows
    .filter((row) => normaliseName(row.name).includes(needle))
    .flatMap((row) => {
      const dives = divesOf.get(row.id) ?? []
      // The Unknown site an import keeps is listed only while a dive is
      // still on it, as You lists it.
      if (
        kind === "site" &&
        isUnknownSite(index.sites.get(row.id)!) &&
        !dives.length
      ) {
        return []
      }
      const live = dives.filter(counted)
      const region = (regionId?: string | null) =>
        regionId ? index.regions.get(regionId)?.name : undefined
      const extra =
        kind === "site"
          ? (() => {
              const site = index.sites.get(row.id)!
              return {
                countryCode: site.countryCode,
                region: region(site.regionId),
                bodyOfWater: site.bodyOfWater,
                water: site.waterType,
              }
            })()
          : kind === "region"
            ? { countryCode: index.regions.get(row.id)!.countryCode }
            : kind === "diveCentre"
              ? { region: region(index.centres.get(row.id)!.regionId) }
              : {}
      return [
        compact({
          id: row.id,
          name: row.name,
          ...extra,
          dives: live.length,
          lastDive: live.at(-1)?.startTime.slice(0, 10),
        }),
      ]
    })
}

export function readTools(server: McpServer, deps: Deps) {
  const index = () => indexLog(readLog(deps.db))

  addTool(server, "get_dive", {
    title: "Get a dive",
    description:
      "One dive in full, by its number as the app shows it (dive 42) or by its id: every field in the app's units, who entered each value (the diver by hand, or the dive computer), the site, people, centre, trip and tags with their ids, and the figures (SAC, MOD, max PO₂, CNS, OTU, safety stop, alarms). Use the id it returns to change the dive.",
    input: z.strictObject({
      number: z.int().positive().optional().describe("The dive's number"),
      id: z.string().optional().describe("The dive's id"),
      includeProfile: z
        .boolean()
        .default(false)
        .describe(
          "Add a minute-by-minute depth and temperature line and the computer's events"
        ),
    }),
    hints: read,
    run(args) {
      const log = index()
      const dive = findDive(log, args)
      const events = selectEvents(deps.db).all(dive.id)
      const mandatoryStops = events.filter(
        (event) => event.type === "mandatory-stop"
      ).length
      return {
        ...diveDetail(log, dive),
        ...(dive.sparkline ? { mandatoryStops } : {}),
        ...(args.includeProfile
          ? { profile: profileOf(deps.db, dive, events) }
          : {}),
      }
    },
  })

  addTool(server, "search_dives", {
    title: "Search dives",
    description:
      "Find dives by date, dive number, site, region, country, trip, dive centre, person, tags, type, gas, depth, duration or text. Entity filters take ids from list_entities. Returns totals for every match (leaving out ignored dives, as the Log does) and one short row per dive on the page, with its number and id.",
    input: searchInput,
    hints: read,
    run(sent) {
      // An id kept from before a merge finds the dives of the one kept.
      const kept = (kind: EntityKind, id?: string) =>
        id && (resolve(deps.db, kind, id) ?? id)
      const search = {
        ...sent,
        siteId: kept("site", sent.siteId),
        regionId: kept("region", sent.regionId),
        tripId: kept("trip", sent.tripId),
        diveCentreId: kept("diveCentre", sent.diveCentreId),
        personId: kept("person", sent.personId),
      }
      const log = index()
      const found = log.log.dives
        .filter((dive) => matches(log, dive, search))
        .sort(orders[search.sort])
      const { page, showing } = paged(found, search.offset, search.limit)
      const totalled = found.filter(counted)
      return {
        showing,
        totals: compact({
          dives: totalled.length,
          timeUnderwaterMin: minutes(
            totalled.reduce((sum, dive) => sum + dive.duration, 0)
          ),
          deepestM: totalled.length
            ? Math.max(...totalled.map((dive) => dive.maxDepth))
            : null,
          longestMin: totalled.length
            ? minutes(Math.max(...totalled.map((dive) => dive.duration)))
            : null,
        }),
        dives: page.map((dive) => diveRow(log, dive)),
      }
    },
  })

  addTool(server, "list_entities", {
    title: "List sites, people, centres, trips or regions",
    description:
      "Sites, regions, people, dive centres or trips: one kind, optionally narrowed by a name it contains (ignoring case and accents). Each row has the id the other tools take and how many dives it is on (leaving out ignored and deleted dives). Look an entity up here before writing, to use the one that exists.",
    input: z.strictObject({
      kind: z.enum(entityKinds),
      name: z.string().optional(),
    }),
    hints: read,
    run: ({ kind, name }) => entityRows(index(), kind, name),
  })
}
