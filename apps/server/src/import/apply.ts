import {
  comparedFields,
  computerAir,
  computerGas,
  defaultWaterType,
  gasDiffers,
  importFile,
  newId,
  normaliseName,
  type ComputerDive,
  type DiveId,
  type ImportApplyRequest,
  type ImportApplyResult,
  type ImportSummary,
  type Sample,
  type WaterType,
} from "@shylog/core"

import {
  same,
  saveDive,
  storedDive,
  validDive,
  type Fields,
} from "../apply/dive.ts"
import { matching, matchOrCreate } from "../apply/entity.ts"
import {
  metaOf,
  recordDiffering,
  recordFilled,
  type Meta,
} from "../apply/field-meta.ts"
import { Rejected } from "../apply/rejected.ts"
import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"
import { recalculate } from "../derived.ts"
import { getMeta, setMeta, write } from "../journal.ts"
import { storeProfile } from "../profile.ts"
import { readUddf, type ProfileEvent, type ReadDive } from "../uddf/reader.ts"
import { fingerprint } from "./fingerprint.ts"
import { isShort, type LeftOut } from "./freedive.ts"
import {
  changedHands,
  computerTemperatures,
  propose,
  savePreview,
  storedPreview,
  type StoredPreview,
} from "./preview.ts"

// Applies a reviewed preview (see For a matched dive and Imports under
// Server in the spec): one transaction and journal entry per 50 computer
// dives, so a large import neither holds the database for long nor makes
// one huge WAL burst.
export const chunkSize = 50

// Where a dive the export gives no site goes, until the diver says.
export const unknownSite = { name: "Unknown site", countryCode: "ZA" }

// An entity the export names, under the id it is made with if nothing
// matches it, chosen here so a replay of the journal makes the same one.
interface Named {
  id: string
  name: string
}
type Region = Named & { countryCode: string }

// Everything a chunk writes for one computer dive.
export interface ImportedDive {
  // Standard UDDF elements, as any computer's; <shylog>'s are hand values.
  computer: Fields
  hand: Fields
  // Null for a paired dive, which keeps its own.
  site:
    | (Named & {
        countryCode: string
        region: Region | null
        bodyOfWater: string | null
        waterType: WaterType
        // The Unknown site, or one the file names in no country, which no
        // one chose, so it gets no source.
        unknown: boolean
      })
    | null
  people: (Named & { professional: boolean })[]
  trip: Named | null
  diveCentre: (Named & { region: Region | null }) | null
  computerModel: string | null
  // Helium or under 20.9 % oxygen, imported on air; absent from entries
  // journalled before the gas was compared.
  unsupportedGas?: boolean
  samples: Sample[]
  events: ProfileEvent[]
  fragment: string
}

// `ref` is the export's id, which names the dive in the preview.
export type ChunkDive =
  | { kind: "leftOut"; ref: string; fingerprint: string; reason: LeftOut }
  | {
      kind: "paired" | "added" | "included"
      ref: string
      fingerprint: string
      diveId: string
      dive: ImportedDive
    }

// One importChunk journal entry's payload.
export interface Chunk {
  importId: string
  alreadyImported: number
  // The apply's last chunk, after which the summary is complete.
  last: boolean
  dives: ChunkDive[]
  // What the file held, for the Import screen; absent from older entries.
  file?: ImportFile
  // The gas is compared (see importGas); a replay of an older entry leaves
  // it alone, as it was applied, so a restore matches the log.
  gasCompared?: true
}

// How many computer dives the file held and the days they span (null when
// every one was imported before), and the computer it names, if one.
export interface ImportFile {
  dives: number
  from: string | null
  to: string | null
  computerModel: string | null
}

interface LastImport {
  id: string
  at: string
  complete: boolean
  summary: ImportSummary
  file?: ImportFile
}

export function lastImport(db: Db): LastImport | null {
  const stored = getMeta(db, "last_import")
  return stored ? (JSON.parse(stored) as LastImport) : null
}

const empty = (value: unknown) =>
  value == null || (Array.isArray(value) && !value.length)
const compared = new Set<string>(comparedFields)

// Fields a core rule ties together, so a filled one that breaks the rule
// with a hand value is the one left empty.
const partners: Record<string, string> = {
  minTemperature: "maxTemperature",
  maxTemperature: "minTemperature",
  averageDepth: "maxDepth",
  maxDepth: "averageDepth",
  startPressure: "endPressure",
  endPressure: "startPressure",
  visibility: "visibilityRating",
  visibilityRating: "visibility",
  buddies: "diveProfessionals",
  diveProfessionals: "buddies",
  nitrox: "oxygen",
  oxygen: "nitrox",
}

// Writes one computer dive onto a hand dive it was paired with, or as a new
// dive. Hand values always stay; empty fields are filled and marked with
// their source, and a computer value that differs from a compared hand
// value is kept beside it. True when one does.
function importDive(
  db: Db,
  diveId: string,
  dive: ImportedDive,
  paired: boolean,
  gasCompared: boolean
): boolean {
  const meta = metaOf(db, diveId)
  const before: Fields = paired ? storedDive(db, diveId, meta)!.fields : {}
  const next: Fields = { ...before }
  const filled = new Map<string, Meta["source"] | null>()
  const differing = new Map<string, unknown>()
  const taken = (field: string) => meta.get(field)?.source === "hand"

  const offer = (
    field: keyof Fields,
    value: unknown,
    source: Meta["source"] | null
  ) => {
    if (empty(value) || filled.has(field)) return
    if (taken(field)) {
      if (
        source === "computer" &&
        compared.has(field) &&
        field !== "oxygen" &&
        !same(before[field], value)
      ) {
        differing.set(field, value)
      }
      return
    }
    next[field] = value
    filled.set(field, source)
  }

  // An entity is matched or made only when the dive takes it, and a region
  // only with a new site or dive centre in it, so none is left unused.
  const region = (found: Region | null) =>
    found &&
    matchOrCreate(db, "region", found.id, {
      name: found.name,
      countryCode: found.countryCode,
    })
  if (dive.site && !taken("siteId")) {
    const { site } = dive
    const fields = {
      name: site.name,
      countryCode: site.countryCode,
      ...(site.bodyOfWater && { bodyOfWater: site.bodyOfWater }),
      waterType: site.waterType,
    }
    let id = matching(db, "site", fields)
    if (id === undefined) {
      const regionId = region(site.region)
      id = matchOrCreate(db, "site", site.id, {
        ...fields,
        ...(regionId && { regionId }),
      })
    }
    offer("siteId", id, site.unknown ? null : "computer")
  }
  // Roles go together: people are added only to a dive that has none. Two
  // names one person matches are that person once, in the first role.
  const roles = ["buddies", "diveProfessionals"] as const
  if (
    dive.people.length &&
    roles.every((field) => !taken(field) && empty(before[field]))
  ) {
    const keys = new Set<string>()
    const people = dive.people.filter((person) => {
      const key = normaliseName(person.name)
      return !keys.has(key) && keys.add(key)
    })
    const ids = (professional: boolean) =>
      people
        .filter((person) => person.professional === professional)
        .map((person) =>
          matchOrCreate(db, "person", person.id, { name: person.name })
        )
    offer("buddies", ids(false), "computer")
    offer("diveProfessionals", ids(true), "computer")
  }
  if (dive.trip && !taken("tripId")) {
    offer(
      "tripId",
      matchOrCreate(db, "trip", dive.trip.id, { name: dive.trip.name }),
      "hand"
    )
  }
  if (dive.diveCentre && !taken("diveCentreId")) {
    const centre = dive.diveCentre
    const fields = { name: centre.name }
    let id = matching(db, "diveCentre", fields)
    if (id === undefined) {
      const regionId = region(centre.region)
      id = matchOrCreate(db, "diveCentre", centre.id, {
        ...fields,
        ...(regionId && { regionId }),
      })
    }
    offer("diveCentreId", id, "hand")
  }
  // <shylog> first: its maximum temperature is the one the log held.
  for (const [field, value] of Object.entries(dive.hand))
    offer(field as keyof Fields, value, "hand")
  const computer = { ...dive.computer }
  // A gas v1 can't hold is stored as air, which isn't the computer's gas,
  // so it is never compared with a hand one.
  if (
    gasCompared &&
    (taken("nitrox") || taken("oxygen")) &&
    !dive.unsupportedGas
  ) {
    const gas = computerGas(computer as { nitrox?: boolean; oxygen?: number })
    delete computer.nitrox
    delete computer.oxygen
    // A hand Nitrox no, often only the new-dive default, takes the
    // computer's nitrox; a hand mix stays, flagged if the computer differs.
    if (gas !== computerAir && !before.nitrox) {
      next.nitrox = true
      next.oxygen = gas
      filled.set("nitrox", "computer")
      filled.set("oxygen", "computer")
    } else if (
      gasDiffers(before as { nitrox?: boolean; oxygen?: number }, gas)
    ) {
      differing.set("oxygen", gas)
    }
  }
  for (const [field, value] of Object.entries(computer))
    offer(field as keyof Fields, value, "computer")

  // A filled value that breaks a rule with a hand one is left empty, such
  // as the computer's average depth below a shallower hand max depth. A rule
  // core gains without a partner here takes the last value filled, so an
  // import is never refused for good over one figure.
  let after: Fields
  for (;;) {
    try {
      after = validDive(db, next)
      break
    } catch (error) {
      if (!(error instanceof Rejected)) throw error
      const field = String(error.path?.[1])
      const drop =
        [field, partners[field]].find((found) => filled.has(found)) ??
        [...filled.keys()].at(-1)
      if (!drop) throw error
      // A filled gas replaced a hand Nitrox no, which comes back.
      if (taken(drop)) next[drop as keyof Fields] = before[drop as keyof Fields]
      else delete next[drop as keyof Fields]
      if (next[drop as keyof Fields] === undefined)
        delete next[drop as keyof Fields]
      filled.delete(drop)
    }
  }
  saveDive(db, diveId, after)
  for (const [field, source] of filled)
    if (source && after[field as keyof Fields] !== undefined)
      recordFilled(db, diveId, field, source)
  for (const [field, value] of differing)
    recordDiffering(db, diveId, field, value)

  prepared(db, "UPDATE dives SET computer_model = ? WHERE id = ?").run(
    dive.computerModel,
    diveId
  )
  // The profile always comes from the computer, the point of importing.
  prepared(db, "DELETE FROM samples WHERE dive_id = ?").run(diveId)
  prepared(db, "DELETE FROM events WHERE dive_id = ?").run(diveId)
  storeProfile(db, diveId, after.duration as number, dive.samples, dive.events)
  prepared(
    db,
    "INSERT INTO import_raw (dive_id, fragment) VALUES (?, ?) ON CONFLICT (dive_id) DO UPDATE SET fragment = excluded.fragment"
  ).run(diveId, dive.fragment)
  return differing.size > 0
}

const emptySummary = (alreadyImported: number): ImportSummary => ({
  paired: 0,
  added: 0,
  alreadyImported,
  leftOut: 0,
  included: 0,
  differing: [],
})

// Applies one chunk, live or replayed from the journal; the caller runs the
// derived pass. The import's running summary is kept in meta, so a retry
// and the Import screen see what was applied.
export function applyChunk(db: Db, chunk: Chunk, at: Date) {
  const last = lastImport(db)
  const summary =
    last?.id === chunk.importId
      ? last.summary
      : emptySummary(chunk.alreadyImported)
  const print = prepared(
    db,
    "INSERT INTO fingerprints (fingerprint, dive_id, reason) VALUES (?, ?, ?)"
  )
  for (const entry of chunk.dives) {
    if (entry.kind === "leftOut") {
      print.run(entry.fingerprint, null, entry.reason)
      summary.leftOut++
      continue
    }
    const paired = entry.kind === "paired"
    const differs = importDive(
      db,
      entry.diveId,
      entry.dive,
      paired,
      !!chunk.gasCompared
    )
    print.run(entry.fingerprint, entry.diveId, paired ? "paired" : "added")
    if (paired) summary.paired++
    else if (entry.kind === "included") summary.included++
    else summary.added++
    if (differs) summary.differing.push(entry.diveId as DiveId)
  }
  setMeta(
    db,
    "last_import",
    JSON.stringify({
      id: chunk.importId,
      at: at.toISOString(),
      complete: chunk.last,
      summary,
      file: chunk.file ?? (last?.id === chunk.importId ? last.file : undefined),
    } satisfies LastImport)
  )
}

// What a chunk stores for one computer dive, with the ids of anything it
// may create.
function imported(
  read: ReadDive,
  startTime: string,
  paired: boolean
): ImportedDive {
  const temperatures = computerTemperatures(read)
  const own = read.own
  const site = read.site
  const countryCode = site?.countryCode ?? unknownSite.countryCode
  return {
    computer: {
      startTime,
      duration: read.duration,
      maxDepth: read.maxDepth,
      averageDepth: read.averageDepth,
      minTemperature: temperatures.min,
      maxTemperature: temperatures.max,
      nitrox: read.oxygen != null,
      oxygen: read.oxygen,
      cylinderVolume: read.cylinderVolume,
      startPressure: read.startPressure,
      endPressure: read.endPressure,
      weight: read.weight,
      notes: read.notes,
      ...read.standard,
    },
    hand: own?.fields ?? {},
    site: paired
      ? null
      : site
        ? {
            id: newId("site"),
            name: site.name,
            countryCode,
            region: site.region
              ? { id: newId("region"), name: site.region, countryCode }
              : null,
            bodyOfWater: site.bodyOfWater,
            waterType:
              own?.waterType ?? defaultWaterType(site.bodyOfWater ?? undefined),
            unknown: site.countryCode == null,
          }
        : {
            id: newId("site"),
            ...unknownSite,
            region: null,
            bodyOfWater: null,
            waterType: defaultWaterType(),
            unknown: true,
          },
    people: read.people.map((person) => ({ id: newId("person"), ...person })),
    trip: own?.trip ? { id: newId("trip"), name: own.trip } : null,
    diveCentre: own?.diveCentre
      ? {
          id: newId("diveCentre"),
          name: own.diveCentre.name,
          region: own.diveCentre.region && {
            id: newId("region"),
            ...own.diveCentre.region,
          },
        }
      : null,
    computerModel: read.computerModel,
    unsupportedGas: read.unsupportedGas,
    samples: read.samples,
    events: read.events,
    fragment: read.fragment!,
  }
}

// The preview's computer dives by ref, each with why it would be left out.
function computerDives(preview: StoredPreview) {
  const dives = new Map<
    string,
    { dive: ComputerDive; reason: LeftOut | null }
  >()
  // A paired dive under five minutes is a blip again once unpaired.
  for (const { computerDive } of preview.pairs)
    dives.set(computerDive.ref, {
      dive: computerDive,
      reason: isShort(computerDive.duration) ? "short" : null,
    })
  for (const dive of preview.newDives)
    dives.set(dive.ref, { dive, reason: null })
  for (const { reason, ...dive } of preview.leftOut)
    dives.set(dive.ref, { dive, reason })
  return dives
}

// Dives an earlier attempt applied are left out of the preview, so a retry
// of the same request names them without being refused.
function check(
  request: ImportApplyRequest,
  dives: ReturnType<typeof computerDives>,
  applied: ReadonlySet<string>
) {
  const known = (ref: string) => {
    const found = dives.get(ref)
    if (!found && !applied.has(ref))
      throw new Rejected(`No dive ${ref} in this import`, 422)
    return found
  }
  for (const { computerDive } of request.pairs) known(computerDive)
  for (const ref of request.add)
    if (known(ref)?.reason)
      throw new Rejected(`Dive ${ref} is left out: include it instead`, 422)
  for (const ref of request.include)
    if (known(ref)?.reason === null)
      throw new Rejected(`Dive ${ref} isn't left out: add it instead`, 422)
}

// `POST /api/import/:id/apply`: re-checks the export's days against the hand
// dives the preview read, then commits in chunks journalled under the import
// id. A dive with a fingerprint is never applied again, so a retry carries on.
// The chunks run back to back, so no other write lands between them.
export function applyImport(
  db: Db,
  id: string,
  request: ImportApplyRequest,
  now = new Date()
): ImportApplyResult {
  const stored = storedPreview(db, id, now)
  if (!stored) {
    // Applied in full already, and the reply was lost.
    const last = lastImport(db)
    if (last?.id === id && last.complete)
      return { status: "applied", ...last.summary }
    throw new Rejected("No such import waiting", 404)
  }
  const { preview, uddf } = stored
  // A review of an earlier proposal, such as a resend of the request that
  // was told of a change, asks again rather than applying stale choices.
  if (request.revision !== preview.revision)
    return { status: "changed", diveIds: preview.asked }

  const changed = changedHands(db, preview)
  if (changed.length) {
    const dates = new Set(changed.flatMap((hand) => hand.days))
    const diveIds = changed.map((hand) => hand.id as DiveId)
    savePreview(db, {
      ...propose(
        db,
        preview,
        preview.days.map((day) => day.date).filter((date) => dates.has(date))
      ),
      asked: diveIds,
    })
    return { status: "changed", diveIds }
  }

  const reads = new Map(
    readUddf(uddf, { fragments: true }).map((read) => [read.ref, read])
  )
  const place = new Map([...reads.keys()].map((ref, i) => [ref, i]))
  const seen = prepared(db, "SELECT 1 FROM fingerprints WHERE fingerprint = ?")
  const done = (ref: string) => seen.get(fingerprint(reads.get(ref)!)) != null
  const dives = computerDives(preview)
  const applied = new Set(preview.applied)
  check(request, dives, applied)

  const pairs = new Map(
    request.pairs
      .filter(({ computerDive }) => !done(computerDive))
      .map(({ computerDive, diveId }) => [computerDive, diveId])
  )
  // A dive paired by hand from another day was never read by the preview.
  const pairable = prepared(
    db,
    `SELECT 1 FROM dives WHERE id = ? AND deleted_at IS NULL
       AND id NOT IN (SELECT dive_id FROM fingerprints WHERE dive_id IS NOT NULL)`
  )
  for (const diveId of pairs.values())
    if (!pairable.get(diveId))
      throw new Rejected(
        "A dive paired by hand was deleted or has a computer dive",
        409,
        ["pairs"]
      )
  const add = new Set(request.add)
  const include = new Set(request.include)

  const actions: ChunkDive[] = []
  // Dives starting together keep the file's order, as a log's own export
  // has them in the order they were written.
  const order = [...dives.values()].sort(
    (a, b) =>
      a.dive.startTime.localeCompare(b.dive.startTime) ||
      place.get(a.dive.ref)! - place.get(b.dive.ref)!
  )
  for (const { dive, reason } of order) {
    if (done(dive.ref)) continue
    const read = reads.get(dive.ref)!
    const print = fingerprint(read)
    const diveId = pairs.get(dive.ref)
    if (diveId) {
      actions.push({
        kind: "paired",
        ref: dive.ref,
        fingerprint: print,
        diveId,
        dive: imported(read, dive.startTime, true),
      })
    } else if (add.has(dive.ref) || include.has(dive.ref)) {
      actions.push({
        kind: include.has(dive.ref) ? "included" : "added",
        ref: dive.ref,
        fingerprint: print,
        diveId: newId("dive"),
        dive: imported(read, dive.startTime, false),
      })
    } else if (reason) {
      actions.push({
        kind: "leftOut",
        ref: dive.ref,
        fingerprint: print,
        reason,
      })
    }
    // Anything else is skipped and gets no fingerprint.
  }

  const chunks: ChunkDive[][] = []
  for (let i = 0; i < actions.length; i += chunkSize)
    chunks.push(actions.slice(i, i + chunkSize))
  // One even with nothing to write, so the summary is kept all the same.
  if (!chunks.length) chunks.push([])
  const earlier = prepared<[string], number>(
    db,
    "SELECT count(*) FROM ops WHERE type = 'importChunk' AND op_id LIKE ? || ':%'"
  )
    .pluck()
    .get(id)!

  const file: ImportFile = importFile(preview)
  let current = preview
  for (const [i, chunkDives] of chunks.entries()) {
    const chunk: Chunk = {
      importId: id,
      alreadyImported: preview.alreadyImported,
      last: i === chunks.length - 1,
      dives: chunkDives,
      file,
      gasCompared: true,
    }
    try {
      write(db, (journal, at) => {
        applyChunk(db, chunk, at)
        recalculate(db)
        journal({
          type: "importChunk",
          payload: chunk,
          opId: `${id}:${earlier + i + 1}`,
        })
        // The preview is scratch, but changes with the chunk: the dives it
        // applied count as imported, so neither a retry nor the review
        // offers them again, and the hand dives it paired aren't taken for
        // edits made since.
        if (chunk.last) {
          prepared(db, "DELETE FROM import_previews WHERE id = ?").run(id)
        } else {
          const refs = new Set(chunkDives.map((entry) => entry.ref))
          const paired = new Set(
            chunkDives.flatMap((entry) =>
              entry.kind === "paired" ? [entry.diveId] : []
            )
          )
          // A proposed pair whose hand dive the request paired with another
          // computer dive is unpaired, as Change pairing would have left it.
          const [stay, freed] = [false, true].map((loose) =>
            current.pairs.filter(
              ({ computerDive, diveId }) =>
                !refs.has(computerDive.ref) && paired.has(diveId) === loose
            )
          )
          const unpaired = freed.map(({ computerDive }) => computerDive)
          current = {
            ...current,
            pairs: stay,
            newDives: [
              ...current.newDives,
              ...unpaired.filter((dive) => !isShort(dive.duration)),
            ].filter((dive) => !refs.has(dive.ref)),
            leftOut: [
              ...current.leftOut,
              ...unpaired
                .filter((dive) => isShort(dive.duration))
                .map((dive) => ({ ...dive, reason: "short" as const })),
            ].filter((dive) => !refs.has(dive.ref)),
            unpaired: current.unpaired.filter(
              (hand) => !paired.has(hand.diveId)
            ),
            alreadyImported: current.alreadyImported + refs.size,
            hands: Object.fromEntries(
              Object.entries(current.hands).filter(
                ([diveId]) => !paired.has(diveId)
              )
            ),
            applied: [...current.applied, ...refs],
          }
          savePreview(db, current)
        }
      })
    } catch (error) {
      const last = lastImport(db)
      return {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        applied:
          last?.id === id
            ? last.summary
            : emptySummary(preview.alreadyImported),
      }
    }
  }
  return { status: "applied", ...lastImport(db)!.summary }
}
