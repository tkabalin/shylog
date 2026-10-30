import {
  diveOxygen,
  maxPo2,
  mod,
  sacDurationAndDepth,
  sacRate,
  type Water,
} from "@shylog/core"

import type { Dive, FieldMeta } from "@/data/db"
import type { LogView } from "@/data/log"

const waterOf = (dive: Dive, log: LogView): Water => ({
  waterType:
    log.sites.get(dive.siteId)?.waterType === "fresh" ? "fresh" : "salt",
})

function diveSac(dive: Dive, log: LogView, water = waterOf(dive, log)) {
  const meta = log.fieldMeta.get(dive.id)
  const hand = (field: string) => meta?.get(field)?.source === "hand"
  const sac = sacDurationAndDepth(
    dive,
    { duration: hand("duration"), averageDepth: hand("averageDepth") },
    dive.sampleDuration && dive.sampleAverageDepth != null
      ? { duration: dive.sampleDuration, averageDepth: dive.sampleAverageDepth }
      : null
  )
  return sacRate({ ...dive, ...sac, oxygen: diveOxygen(dive) }, water)
}

// The detail's calculated figures, every one from core (see Calculations in
// the spec), from the log copy alone so they show on the first frame.
export function diveFigures(dive: Dive, log: LogView) {
  const water = waterOf(dive, log)
  const oxygen = diveOxygen(dive)
  const limit = log.settings.maxPo2
  const po2 = oxygen == null ? null : maxPo2(oxygen, dive.maxDepth, water)
  const modDepth = oxygen == null ? null : mod(oxygen, limit, water)
  return {
    sac: diveSac(dive, log, water),
    maxPo2: po2,
    // Highlighted when it passes the maximum PO₂ setting.
    po2Over: po2 != null && po2 > limit,
    // A limit at or below the surface PO₂ gives no depth to show (-0 too).
    mod: modDepth != null && modDepth > 0 ? modDepth : null,
    limit,
  }
}

const recent = 5

// The SAC rates of the five logged dives before this one that have one, for
// the detail to set its own against. Recent rather than all-time, since a
// diver's SAC improves and every new dive would beat the early ones. Ignored
// dives and rates of 0.1 L/min or less are left out, as in Statistics.
export function recentSac(dive: Dive, log: LogView) {
  const rates: number[] = []
  // Newest first, so the first five found are the latest.
  for (const other of log.dives) {
    if (other.startTime >= dive.startTime || other.ignored) continue
    const sac = diveSac(other, log)
    if (sac != null && sac > 0.1) rates.push(sac)
    if (rates.length === recent) return rates
  }
  return null
}

// The depth the profile is drawn to: the computer's own, since the chart
// draws its samples. A hand value that replaced it may be far off (a typo,
// a dive the computer only partly logged) and would squash the line.
export function profileMaxDepth(dive: Dive, meta?: Map<string, FieldMeta>) {
  const row = meta?.get("maxDepth")
  return row?.source === "hand" && typeof row.computerValue === "number"
    ? row.computerValue
    : dive.maxDepth
}
