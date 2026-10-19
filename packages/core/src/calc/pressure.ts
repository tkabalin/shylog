import type { WaterType } from "../enums.ts"
import { lrint } from "./round.ts"

// Subsurface's SURFACE_THRESHOLD: only below 75 cm is it really diving.
export const surfaceThreshold = 750

// 1 atm as Subsurface rounds it, used when the dive has no surface pressure.
export const standardPressure = 1013

// Grams per 10 litres, Subsurface's salinity unit.
const salinity: Record<WaterType, number> = { salt: 10300, fresh: 10000 }

export interface Water {
  waterType: WaterType
  // mbar, from UDDF `surfacepressure` when the export has it.
  surfacePressure?: number
}

// Calculations work in whole millimetres and millibar, as Subsurface does.
export const toMillimetres = (metres: number) => lrint(metres * 1000)

// mbar per mm of depth (calculate_depth_to_mbarf in core/dive.cpp).
export const specificWeight = (water: Water) =>
  (salinity[water.waterType] * 0.981) / 100000

export const surfacePressure = (water: Water) =>
  water.surfacePressure || standardPressure

// Ambient pressure in whole mbar at a depth in mm.
export const depthToMbar = (depth: number, water: Water) =>
  lrint(surfacePressure(water) + depth * specificWeight(water))

export const isAtSurface = (depth: number) => depth < surfaceThreshold
