import {
  diveOxygen,
  diveSacRate,
  maxPo2,
  mod,
  type SacInputs,
  type WaterType,
} from "@shylog/core"

// What the gas figures read from a stored dive, in database units.
export type GasDive = Omit<SacInputs, "oxygen" | "duration"> & {
  duration: number
  maxDepth: number
  nitrox: boolean
  oxygen: number | null
  sampleDuration: number | null
  sampleAverageDepth: number | null
}

// A dive's gas figures as its detail shows them, for the CSV export and the
// MCP tools: SAC takes a hand duration or average depth over the samples'
// figures, and MOD and max PO₂ are at the log's limit.
export function gasFigures(
  dive: GasDive,
  hand: { duration: boolean; averageDepth: boolean },
  waterType: WaterType,
  limit: number
) {
  const water = { waterType }
  const oxygen = diveOxygen(dive)
  const modDepth = oxygen == null ? null : mod(oxygen, limit, water)
  return {
    oxygen,
    sac: diveSacRate(dive, hand, water),
    // A limit at or below the surface PO₂ gives no depth (-0 too).
    mod: modDepth != null && modDepth > 0 ? modDepth : null,
    maxPo2: oxygen == null ? null : maxPo2(oxygen, dive.maxDepth, water),
  }
}
