import { normaliseName, type EntityKind } from "@shylog/core"

import { apiClient } from "@/api/client"
import { countText } from "@/components/pickers/match"
import { monthLabel, months } from "@/format/dates"

import type { Dive } from "./db"
import { commit } from "./edits"
import type { LogView } from "./log"

// The entity screens' reading of the log: which dives use what, the
// figures on each detail, and likely duplicates to merge (see Sites, people
// and trips in the spec).

export interface Entity {
  id: string
  name: string
}

export function entitiesOf(log: LogView, kind: EntityKind): Entity[] {
  const map = {
    site: log.sites,
    region: log.regions,
    person: log.people,
    diveCentre: log.diveCentres,
    trip: log.trips,
  }[kind]
  return [...map.values()]
}

// Whether a dive uses an entity: a region through its dive's site.
function uses(log: LogView, kind: EntityKind, id: string, dive: Dive) {
  switch (kind) {
    case "site":
      return dive.siteId === id
    case "region":
      return log.sites.get(dive.siteId)?.regionId === id
    case "person": {
      const links = log.links.get(dive.id)
      return !!(
        links?.buddies.includes(id) || links?.professionals.includes(id)
      )
    }
    case "diveCentre":
      return dive.diveCentreId === id
    case "trip":
      return dive.tripId === id
  }
}

// The dives an entity's figures count: in the log, not ignored (D23),
// newest first.
export const divesOf = (log: LogView, kind: EntityKind, id: string) =>
  log.dives.filter((dive) => !dive.ignored && uses(log, kind, id, dive))

// Every logged dive that uses it, ignored ones too: what its Dives list
// shows and what a merge moves.
export const divesUsing = (log: LogView, kind: EntityKind, id: string) =>
  log.dives.filter((dive) => uses(log, kind, id, dive))

// Each entity's logged dives in one pass over the log, for lists and the
// merge sheet: with `ignored`, ignored dives count too.
export function diveCounts(
  log: LogView,
  kind: EntityKind,
  { ignored = false }: { ignored?: boolean } = {}
) {
  const counts = new Map<string, number>()
  const add = (id: string | null | undefined) =>
    id && counts.set(id, (counts.get(id) ?? 0) + 1)
  for (const dive of log.dives) {
    if (dive.ignored && !ignored) continue
    if (kind === "site") add(dive.siteId)
    else if (kind === "region") add(log.sites.get(dive.siteId)?.regionId)
    else if (kind === "diveCentre") add(dive.diveCentreId)
    else if (kind === "trip") add(dive.tripId)
    else {
      const links = log.links.get(dive.id)
      for (const id of new Set([
        ...(links?.buddies ?? []),
        ...(links?.professionals ?? []),
      ]))
        add(id)
    }
  }
  return counts
}

// What stops a delete, as the server counts it (deleted and ignored dives,
// a region's sites and centres), named apart where the detail can't list
// them. A trip is stopped only by a draft, whose upload would be refused.
export function usedBy(log: LogView, kind: EntityKind, id: string) {
  if (kind === "trip") {
    const drafts = [...log.dive.values()].filter(
      (dive) => dive.draft && dive.tripId === id
    ).length
    return drafts
      ? `${countText(drafts)} ${drafts === 1 ? "dive" : "dives"} not synced yet`
      : ""
  }
  // A region's dives are its sites', which block it already.
  const all =
    kind === "region"
      ? []
      : [...log.dive.values()].filter((dive) => uses(log, kind, id, dive))
  const deleted = all.filter((dive) => dive.deletedAt).length
  const counts: [string, number][] =
    kind === "region"
      ? [
          [
            "site",
            [...log.sites.values()].filter((site) => site.regionId === id)
              .length,
          ],
          [
            "dive centre",
            [...log.diveCentres.values()].filter(
              (centre) => centre.regionId === id
            ).length,
          ],
        ]
      : [["dive", all.length - deleted]]
  const parts = counts
    .filter(([, n]) => n > 0)
    .map(([noun, n]) => `${countText(n)} ${noun}${n === 1 ? "" : "s"}`)
  if (deleted)
    parts.push(
      parts.length
        ? `${countText(deleted)} in Recently deleted`
        : `${countText(deleted)} ${deleted === 1 ? "dive" : "dives"} in Recently deleted`
    )
  return parts.join(" and ")
}

// A region's sites, which its list row counts instead of dives.
export const sitesIn = (log: LogView, regionId: string) =>
  [...log.sites.values()].filter((site) => site.regionId === regionId)

const deepest = (dives: Dive[]) =>
  dives.length ? Math.max(...dives.map((dive) => dive.maxDepth)) : null

// A trip's dates come from its dives: "18 – 27 Jul 2026", or across years
// "28 Dec 2025 – 3 Jan 2026". Days are the dates it has dives on.
export function tripDates(dives: Dive[]) {
  if (!dives.length) return null
  const days = dives.map((dive) => dive.startTime.slice(0, 10)).sort()
  const first = days[0]
  const last = days[days.length - 1]
  const [fy, fm, fd] = first.split("-").map(Number)
  const [ly, lm, ld] = last.split("-").map(Number)
  const month = (m: number) => months[m - 1]
  const text =
    first === last
      ? `${fd} ${month(fm)} ${fy}`
      : fy !== ly
        ? `${fd} ${month(fm)} ${fy} – ${ld} ${month(lm)} ${ly}`
        : fm !== lm
          ? `${fd} ${month(fm)} – ${ld} ${month(lm)} ${ly}`
          : `${fd} – ${ld} ${month(lm)} ${ly}`
  return { text, days: new Set(days).size }
}

export interface Figure {
  term: string
  // A depth in metres, a count, or a local start time for "Last dive".
  value: number | string | null
  kind: "count" | "depth" | "date"
}

// Each detail's three figures, leaving out ignored dives (D20, D23).
export function figuresOf(
  log: LogView,
  kind: EntityKind,
  id: string
): { figures: Figure[]; since?: string } {
  const dives = divesOf(log, kind, id)
  const last = dives[0]?.startTime ?? null
  const count = (term: string, value: number): Figure => ({
    term,
    value,
    kind: "count",
  })
  const lastDive: Figure = { term: "Last dive", value: last, kind: "date" }
  const deepestDive: Figure = {
    term: "Deepest",
    value: deepest(dives),
    kind: "depth",
  }
  const sites = new Set(dives.map((dive) => dive.siteId)).size
  switch (kind) {
    case "site":
      return { figures: [count("Dives", dives.length), deepestDive, lastDive] }
    case "person": {
      const asBuddy = dives.filter((dive) =>
        log.links.get(dive.id)?.buddies.includes(id)
      )
      const first = asBuddy[asBuddy.length - 1]
      return {
        figures: [
          count("Dives together", dives.length),
          count("As buddy", asBuddy.length),
          lastDive,
        ],
        since: first ? monthLabel(first.startTime) : undefined,
      }
    }
    case "diveCentre":
    case "region":
      return {
        figures: [
          count("Dives", dives.length),
          count("Sites", sites),
          lastDive,
        ],
      }
    case "trip":
      return {
        figures: [
          count("Dives", dives.length),
          count("Days", tripDates(dives)?.days ?? 0),
          deepestDive,
        ],
      }
  }
}

// Number words become digits, so "Two Mile Reef" and "2 Mile Reef" share
// a key; punctuation goes, so commas and full stops never tell names apart,
// but a hyphen keeps a double-barrelled name one word for the initial rule.
// A Map, so a word such as "constructor" never finds Object's own.
const numbers = new Map(
  "zero one two three four five six seven eight nine ten eleven twelve"
    .split(" ")
    .map((word, i) => [word, String(i)])
)

const words = (name: string) =>
  normaliseName(name)
    .replace(/[^\p{L}\p{N}\s-]|(?<![\p{L}\p{N}])-|-(?![\p{L}\p{N}])/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => numbers.get(word) ?? word)

// "Sam N" for Sam Naidoo: the same first word, and each later word of one
// is the other's initial. Only a letter is an initial, so "Wreck 1" and
// "Wreck 12" stay apart.
const initial = (word: string) => /^\p{L}$/u.test(word)

function initialled(a: string[], b: string[]) {
  if (a.length !== b.length || a.length < 2 || a[0] !== b[0]) return false
  const rest = a.slice(1).map((word, i) => [word, b[i + 1]])
  return (
    rest.some(([x, y]) => initial(x) || initial(y)) &&
    rest.every(
      ([x, y]) =>
        x === y || (initial(x) && x === y[0]) || (initial(y) && y === x[0])
    )
  )
}

// The spec's three rules. "Share a prefix" is read as one name starting
// with the whole of the other, at least five letters long ("Coral Edge" and
// "Coral Edge Diving"), so two trips both starting "Sodwana," aren't paired.
export const likelySameName = (a: string, b: string) =>
  sameWords(words(a), words(b))

function sameWords(wa: string[], wb: string[]) {
  const ka = wa.join(" ")
  const kb = wb.join(" ")
  if (ka === kb) return true
  if (initialled(wa, wb)) return true
  const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka]
  return short.length >= 5 && long.startsWith(`${short} `)
}

// Whether two entities can be merged: regions only within a country (Rules
// for edits), and neither one only a draft has, which the server can't
// find yet.
function mergeable(log: LogView, kind: EntityKind, a: string, b: string) {
  if (log.pending.has(a) || log.pending.has(b)) return false
  if (kind === "region")
    return log.regions.get(a)?.countryCode === log.regions.get(b)?.countryCode
  return true
}

// Suggested as duplicates only within a country too: Long Beach in South
// Africa is no duplicate of the one in Vietnam, though they can be merged.
const suggestible = (log: LogView, kind: EntityKind, a: string, b: string) =>
  mergeable(log, kind, a, b) &&
  (kind !== "site" ||
    log.sites.get(a)?.countryCode === log.sites.get(b)?.countryCode)

// For each entity that looks like another, the one it looks like: the less
// used points at the most used of its look-alikes, which is the one to
// keep. Ties go by id, so exactly one of a pair is flagged.
export function duplicates(
  log: LogView,
  kind: EntityKind,
  counts: Map<string, number>
) {
  const found = new Map<string, Entity>()
  const all = entitiesOf(log, kind)
  // Each name's words once, not once per pair.
  const named = new Map(all.map((one) => [one.id, words(one.name)]))
  const count = (one: Entity) => counts.get(one.id) ?? 0
  const before = (a: Entity, b: Entity) =>
    count(a) < count(b) || (count(a) === count(b) && a.id < b.id)
  for (const a of all) {
    for (const b of all) {
      if (a.id === b.id || !before(a, b)) continue
      if (!suggestible(log, kind, a.id, b.id)) continue
      if (!sameWords(named.get(a.id)!, named.get(b.id)!)) continue
      const kept = found.get(a.id)
      if (!kept || before(kept, b)) found.set(a.id, b)
    }
  }
  return found
}

// Who could be merged into an entity: the same kind, mergeable with it.
export const mergeCandidates = (log: LogView, kind: EntityKind, id: string) =>
  entitiesOf(log, kind).filter(
    (other) => other.id !== id && mergeable(log, kind, id, other.id)
  )

// The requests, as edits to synced data.
const entities = () => apiClient().api.entities[":kind"][":id"]

export const putEntity = (
  kind: EntityKind,
  id: string,
  fields: Record<string, unknown>
) => commit(entities().$put({ param: { kind, id }, json: fields }))

// Merges `id` into `into`, which keeps its dives and name.
export const mergeEntity = (
  kind: EntityKind,
  id: string,
  into: string,
  options?: { settle?: boolean }
) =>
  commit(
    entities().merge.$post({ param: { kind, id }, json: { into } }),
    options
  )

export const deleteEntity = (
  kind: EntityKind,
  id: string,
  options?: { settle?: boolean }
) => commit(entities().$delete({ param: { kind, id } }), options)
