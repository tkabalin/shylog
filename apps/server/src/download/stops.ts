import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"
import { fingerprint } from "../import/fingerprint.ts"
import { write } from "../journal.ts"
import { mandatoryStopRows } from "../profile.ts"
import { readUddf } from "../uddf/reader.ts"

// Mandatory stops for dives already in the log, which came in through
// Subsurface's export and so have none: the watch is read again and each
// dive it matches by fingerprint gets the stops it holds (see Downloading
// from the dive computer in the spec). Nothing else on the dive changes.

export interface Stop {
  start: number
  end: number | null
}

// Each dive in the download with mandatory stops that matches a dive in
// the log without any. Deleted dives count, so a restored one has them too.
// A log dive two downloaded dives match is left alone and named in `twice`,
// as which stops are its can't be told.
export function stopsToAdd(db: Db, uddf: string) {
  const owner = prepared<[string], string>(
    db,
    "SELECT dive_id FROM fingerprints WHERE fingerprint = ?"
  ).pluck()
  const has = prepared<[string], number>(
    db,
    "SELECT 1 FROM events WHERE dive_id = ? AND type = 'mandatory-stop'"
  ).pluck()
  const matched = readUddf(uddf).flatMap((dive) => {
    const stops = dive.events
      .filter((event) => event.type === "mandatory-stop")
      .map(({ start, end }) => ({ start, end }))
    const diveId = stops.length ? owner.get(fingerprint(dive)) : undefined
    return diveId && !has.get(diveId)
      ? [{ diveId, startTime: dive.startTime, stops }]
      : []
  })
  const counts = new Map<string, number>()
  for (const { diveId } of matched)
    counts.set(diveId, (counts.get(diveId) ?? 0) + 1)
  return {
    found: matched.filter(({ diveId }) => counts.get(diveId) === 1),
    twice: matched.filter(({ diveId }) => counts.get(diveId)! > 1),
  }
}

// Replayed as journalled. The dive's count of Events rows its stops take
// (one where each became mandatory, one where it was cleared) moves too.
export function insertStops(db: Db, diveId: string, stops: Stop[]) {
  const event = prepared(
    db,
    "INSERT INTO events (dive_id, type, start_seconds, end_seconds) VALUES (?, 'mandatory-stop', ?, ?)"
  )
  for (const { start, end } of stops) event.run(diveId, start, end)
  prepared(
    db,
    "UPDATE dives SET mandatory_stop_events = mandatory_stop_events + ? WHERE id = ?"
  ).run(mandatoryStopRows(stops), diveId)
}

// Finds and adds them in one transaction, an entry for each dive, so a
// write in between can't make a dive look stopless twice.
export function addStops(db: Db, uddf: string) {
  return write(db, (journal) => {
    const result = stopsToAdd(db, uddf)
    for (const { diveId, stops } of result.found) {
      insertStops(db, diveId, stops)
      journal({ type: "addMandatoryStops", payload: { diveId, stops } })
    }
    return result
  })
}
