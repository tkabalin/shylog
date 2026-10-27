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

// The detail's calculated figures, every one from core (see Calculations in
// the spec), from the log copy alone so they show on the first frame.
export function diveFigures(dive: Dive, log: LogView) {
  const site = log.sites.get(dive.siteId)
  const water: Water = {
    waterType: site?.waterType === "fresh" ? "fresh" : "salt",
  }
  const meta = log.fieldMeta.get(dive.id)
  const hand = (field: string) => meta?.get(field)?.source === "hand"
  const oxygen = diveOxygen(dive)
  const limit = log.settings.maxPo2

  const sac = sacDurationAndDepth(
    dive,
    { duration: hand("duration"), averageDepth: hand("averageDepth") },
    dive.sampleDuration && dive.sampleAverageDepth != null
      ? { duration: dive.sampleDuration, averageDepth: dive.sampleAverageDepth }
      : null
  )
  const po2 = oxygen == null ? null : maxPo2(oxygen, dive.maxDepth, water)
  const modDepth = oxygen == null ? null : mod(oxygen, limit, water)
  return {
    sac: sacRate({ ...dive, ...sac, oxygen }, water),
    maxPo2: po2,
    // Highlighted when it passes the maximum PO₂ setting.
    po2Over: po2 != null && po2 > limit,
    // A limit at or below the surface PO₂ gives no depth to show (-0 too).
    mod: modDepth != null && modDepth > 0 ? modDepth : null,
    limit,
  }
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
