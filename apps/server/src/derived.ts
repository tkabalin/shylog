import {
  cnsWithCarryOver,
  diveCns,
  diveEnd,
  diveOtu,
  diveOxygen,
  surfaceInterval,
  type Sample,
  type WaterType,
} from "@shylog/core"

import type { Db } from "./db/open.ts"
import { prepared } from "./db/prepared.ts"
import { selectSamples } from "./profile.ts"

interface Row {
  id: string
  startTime: string
  duration: number
  maxDepth: number
  ignored: number
  tripId: string | null
  nitrox: number
  oxygen: number | null
  override: number
  surfaceInterval: number | null
  averageDepth: number | null
  // Stored with the samples (storeProfile), so it isn't worked out again.
  sampledAverageDepth: number | null
  minTemperature: number | null
  maxTemperature: number | null
  waterType: WaterType
  deleted: number
}

// The extremes of a dive's sample temperatures (D10), or nulls without any.
export function sampleTemperatures(samples: readonly Sample[]) {
  const values = samples
    .map((sample) => sample.temperature)
    .filter((value) => value != null)
  return values.length
    ? { min: Math.min(...values), max: Math.max(...values) }
    : { min: null, max: null }
}

// Recalculates every dive's number, surface interval, average depth,
// temperatures, CNS and OTU in one pass, inside the caller's write. Fine at
// hundreds of dives; see docs/PLAN.md before reaching for anything finer.
export function recalculate(db: Db) {
  const rows = prepared<[], Row>(
    db,
    `SELECT d.id, d.start_time AS startTime, d.duration,
         d.max_depth AS maxDepth, d.ignored,
         d.trip_id AS tripId, d.nitrox, d.oxygen,
         d.surface_interval_override AS override,
         d.surface_interval AS surfaceInterval,
         d.average_depth AS averageDepth,
         d.sample_average_depth AS sampledAverageDepth,
         d.min_temperature AS minTemperature,
         d.max_temperature AS maxTemperature, s.water_type AS waterType,
         d.deleted_at IS NOT NULL AS deleted
       FROM dives d JOIN sites s ON s.id = d.site_id
       ORDER BY d.seq`
  ).all()
  const samplesOf = selectSamples(db)
  const recorded = new Set(
    prepared(
      db,
      "SELECT dive_id || ' ' || field FROM field_meta WHERE field IN ('averageDepth', 'minTemperature', 'maxTemperature')"
    )
      .pluck()
      .all() as string[]
  )

  // Deleted dives are out of the log; ignored ones still count for the body.
  const live = rows
    .filter((row) => !row.deleted)
    .map((row) => {
      const samples = samplesOf.all(row.id)
      const water = { waterType: row.waterType }
      const oxygen = diveOxygen({
        nitrox: row.nitrox === 1,
        oxygen: row.oxygen,
      })
      // What the update needs from the samples, so they aren't all held.
      return {
        ...row,
        temperatures: sampleTemperatures(samples),
        end: diveEnd(row.duration, samples),
        cns: oxygen == null ? null : diveCns(samples, oxygen, water),
        otu: oxygen == null ? null : diveOtu(samples, oxygen, water),
      }
    })

  // Rows are in the order written, which settles equal start times.
  const numbers = new Map(
    live
      .filter((dive) => !dive.ignored)
      .sort((a, b) =>
        a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0
      )
      .map((dive, i) => [dive.id, i + 1])
  )

  prepared(
    db,
    "UPDATE dives SET number = NULL, cns = NULL, otu = NULL WHERE deleted_at IS NOT NULL"
  ).run()
  const update = prepared(
    db,
    `UPDATE dives SET number = @number, surface_interval = @surfaceInterval,
       average_depth = @averageDepth, min_temperature = @minTemperature,
       max_temperature = @maxTemperature, cns = @cns, otu = @otu
     WHERE id = @id`
  )
  for (const dive of live) {
    const interval = dive.override
      ? dive.surfaceInterval
      : surfaceInterval(dive.startTime, live)
    const has = (field: string) => recorded.has(`${dive.id} ${field}`)
    // Both temperatures or neither, so a hand value is never paired with a
    // calculated one that breaks their order.
    const calculateTemperatures =
      !has("minTemperature") && !has("maxTemperature")
    update.run({
      id: dive.id,
      number: numbers.get(dive.id) ?? null,
      surfaceInterval: interval === "none" ? null : interval,
      // A hand max depth shallower than the samples' average leaves none.
      averageDepth: has("averageDepth")
        ? dive.averageDepth
        : dive.sampledAverageDepth != null &&
            dive.sampledAverageDepth <= dive.maxDepth
          ? dive.sampledAverageDepth
          : null,
      minTemperature: calculateTemperatures
        ? dive.temperatures.min
        : dive.minTemperature,
      maxTemperature: calculateTemperatures
        ? dive.temperatures.max
        : dive.maxTemperature,
      cns: cnsWithCarryOver(dive, live),
      otu: dive.otu,
    })
  }
}
