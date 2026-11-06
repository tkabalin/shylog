import {
  newId,
  type ComputerDive,
  type ImportOffsetRequest,
  type ImportPreview,
} from "@shylog/core"

import { Rejected } from "../apply/rejected.ts"
import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"
import { sampleTemperatures } from "../derived.ts"
import { currentVersion } from "../journal.ts"
import { sparkline } from "../profile.ts"
import { readUddf, UnreadableUddf, type ReadDive } from "../uddf/reader.ts"
import { fingerprint } from "./fingerprint.ts"
import { isShort, leftOut, type LeftOut } from "./freedive.ts"
import { dateOf, estimateOffsets, planDays, shift } from "./offset.ts"
import { nearestStartGap, pairDay, type HandDive } from "./pairing.ts"

const week = 7 * 24 * 60 * 60 * 1000

type Entry = ComputerDive & { reason: LeftOut | null }

// Live dives no computer dive has been paired with, the only ones an
// import pairs or lists.
const handDives = (db: Db) =>
  prepared<[], HandDive>(
    db,
    `SELECT id, start_time AS startTime, duration, max_depth AS maxDepth,
       average_depth AS averageDepth
     FROM dives
     WHERE deleted_at IS NULL
       AND id NOT IN (SELECT dive_id FROM fingerprints WHERE dive_id IS NOT NULL)
     ORDER BY start_time, seq`
  ).all()

// The start is shifted by the day's offset once the day is proposed.
function entry(dive: ReadDive, day: string, reason: LeftOut | null): Entry {
  const temperatures = sampleTemperatures(dive.samples)
  return {
    ref: dive.ref,
    day,
    computerStartTime: dive.startTime,
    startTime: dive.startTime,
    duration: dive.duration,
    maxDepth: dive.maxDepth,
    averageDepth: dive.averageDepth,
    minTemperature: dive.minTemperature ?? temperatures.min,
    maxTemperature: temperatures.max,
    profile: sparkline(dive.samples, dive.duration),
    unsupportedGas: dive.unsupportedGas,
    reason,
  }
}

type DayProposal = Pick<
  ImportPreview,
  "pairs" | "newDives" | "unpaired" | "leftOut"
>

// One day's proposal: its computer dives shifted by the day's offset, paired
// with the day's hand dives, the rest offered as new or left out.
function proposeDay(
  date: string,
  offset: number,
  entries: readonly Entry[],
  hands: readonly HandDive[]
): DayProposal {
  const moved = entries
    .map((dive) => ({
      ...dive,
      startTime: shift(dive.computerStartTime, offset),
    }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
  const scuba = moved.filter((dive) => !dive.reason)
  const dayHands = hands.filter((hand) => dateOf(hand.startTime) === date)
  // A dive under five minutes that a logged dive matches was a real dive,
  // so it pairs as usual; only an unmatched one is left out as a blip.
  const pairs = pairDay(
    dayHands,
    moved.filter((dive) => dive.reason !== "freedive")
  )
  const paired = new Set(pairs.values())
  return {
    pairs: moved.flatMap(({ reason, ...dive }) =>
      reason !== "freedive" && pairs.has(dive.ref)
        ? [{ computerDive: dive, diveId: pairs.get(dive.ref)! }]
        : []
    ),
    newDives: moved.flatMap(({ reason, ...dive }) =>
      !reason && !pairs.has(dive.ref) ? [dive] : []
    ),
    unpaired: dayHands
      .filter((hand) => !paired.has(hand.id))
      .map((hand) => ({
        diveId: hand.id,
        day: date,
        nearestStartGap: nearestStartGap(hand, scuba),
      })),
    leftOut: moved.flatMap(({ reason, ...dive }) =>
      reason && !pairs.has(dive.ref) ? [{ ...dive, reason }] : []
    ),
  }
}

// The diver chose the wrong file, or one the import can't take, which the
// Import screen says before anything is stored.
function readFile(xml: string) {
  let read: ReadDive[]
  try {
    read = readUddf(xml)
  } catch (error) {
    if (error instanceof UnreadableUddf) throw new Rejected(error.message, 400)
    throw error
  }
  if (!read.length) throw new Rejected("There are no dives in this file", 400)
  return read
}

// Reads an export into a preview against the log as it is now. Computer
// dives an earlier import fingerprinted are only counted.
export function buildPreview(db: Db, xml: string, now: Date): ImportPreview {
  const read = readFile(xml)
  // A dive the file holds twice is the same computer dive, so the repeat
  // counts as imported, as apply could only fingerprint it once.
  const seen = prepared(db, "SELECT 1 FROM fingerprints WHERE fingerprint = ?")
  const inFile = new Set<string>()
  const fresh = read.filter((dive) => {
    const print = fingerprint(dive)
    if (inFile.has(print) || seen.get(print)) return false
    inFile.add(print)
    return true
  })
  const reasons = new Map(fresh.map((dive) => [dive.ref, leftOut(dive)]))
  const hands = handDives(db)
  const estimates = estimateOffsets(
    hands,
    fresh.filter((dive) => !reasons.get(dive.ref))
  )
  const { dayOf, days } = planDays(fresh, estimates)
  const entries = fresh.map((dive) =>
    entry(dive, dayOf.get(dive.ref)!, reasons.get(dive.ref)!)
  )
  const proposals = days.map((day) =>
    proposeDay(
      day.date,
      day.offset,
      entries.filter((dive) => dive.day === day.date),
      hands
    )
  )
  // From the whole file, so an export already imported still names it.
  const models = new Set(read.map((dive) => dive.computerModel))
  return {
    id: newId("import"),
    basedOnVersion: currentVersion(db)!,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + week).toISOString(),
    computerModel: models.size === 1 ? [...models][0] : null,
    days: days.map((day) => ({
      date: day.date,
      estimatedOffset: day.offset,
      offset: day.offset,
    })),
    pairs: proposals.flatMap((proposal) => proposal.pairs),
    newDives: proposals.flatMap((proposal) => proposal.newDives),
    unpaired: proposals.flatMap((proposal) => proposal.unpaired),
    leftOut: proposals.flatMap((proposal) => proposal.leftOut),
    alreadyImported: read.length - fresh.length,
  }
}

// Previews are scratch, not log data: they are written outside the journal
// and change no version. One waits at a time, so a new upload replaces it.
export function storePreview(db: Db, xml: string, now = new Date()) {
  const preview = buildPreview(db, xml, now)
  db.transaction(() => {
    prepared(db, "DELETE FROM import_previews").run()
    prepared(
      db,
      `INSERT INTO import_previews
         (id, data_version, created_at, expires_at, preview, uddf)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      preview.id,
      preview.basedOnVersion,
      preview.createdAt,
      preview.expiresAt,
      JSON.stringify(preview),
      xml
    )
  })()
  return preview
}

// The preview awaiting review, once it hasn't expired. Reading writes
// nothing, so it still works while saving is paused.
export function pendingPreview(db: Db, now = new Date()) {
  const stored = prepared<[string], string>(
    db,
    "SELECT preview FROM import_previews WHERE expires_at > ? ORDER BY created_at DESC LIMIT 1"
  )
    .pluck()
    .get(now.toISOString())
  return stored ? (JSON.parse(stored) as ImportPreview) : null
}

function previewById(db: Db, id: string, now: Date) {
  const preview = pendingPreview(db, now)
  if (preview?.id !== id) throw new Rejected("No such import waiting", 404)
  return preview
}

// Stores a day's clock offset, or puts it back to the estimate, and proposes
// that day's pairs again against the log as it is now. Other days keep
// theirs, and no dive moves to another day.
export function setDayOffset(
  db: Db,
  id: string,
  request: ImportOffsetRequest,
  now = new Date()
) {
  const preview = previewById(db, id, now)
  const day = preview.days.find((found) => found.date === request.date)
  if (!day) throw new Rejected("No dives on that day", 400, ["date"])
  const offset = request.offset ?? day.estimatedOffset
  const others = <T extends { day: string }>(list: T[]) =>
    list.filter((item) => item.day !== day.date)
  const entries: Entry[] = [
    // A paired dive is never a freedive, so a short one is a blip again
    // if the new offset unpairs it.
    ...preview.pairs.map(({ computerDive }) => ({
      ...computerDive,
      reason: isShort(computerDive.duration) ? ("short" as const) : null,
    })),
    ...preview.newDives.map((dive) => ({ ...dive, reason: null })),
    ...preview.leftOut,
  ].filter((dive) => dive.day === day.date)
  const proposal = proposeDay(day.date, offset, entries, handDives(db))
  // Each list stays in day order, as it was built.
  const byDay = <T extends { day: string }>(list: T[]) =>
    list.sort((a, b) => a.day.localeCompare(b.day))
  const updated: ImportPreview = {
    ...preview,
    days: preview.days.map((found) =>
      found === day ? { ...found, offset } : found
    ),
    pairs: [
      ...preview.pairs.filter(
        ({ computerDive }) => computerDive.day !== day.date
      ),
      ...proposal.pairs,
    ].sort((a, b) => a.computerDive.day.localeCompare(b.computerDive.day)),
    newDives: byDay([...others(preview.newDives), ...proposal.newDives]),
    unpaired: byDay([...others(preview.unpaired), ...proposal.unpaired]),
    leftOut: byDay([...others(preview.leftOut), ...proposal.leftOut]),
  }
  prepared(db, "UPDATE import_previews SET preview = ? WHERE id = ?").run(
    JSON.stringify(updated),
    id
  )
  return updated
}

// Run nightly before the snapshot, so an expired upload of up to 25 MB isn't
// kept in the backups.
export function purgeExpiredPreviews(db: Db, now = new Date()) {
  prepared(db, "DELETE FROM import_previews WHERE expires_at <= ?").run(
    now.toISOString()
  )
}

// Safe to repeat, as a reply lost on the way back would otherwise leave the
// app showing a preview that is already gone.
export function discardPreview(db: Db, id: string) {
  prepared(db, "DELETE FROM import_previews WHERE id = ?").run(id)
}
