import {
  depthToMbar,
  specificWeight,
  surfacePressure,
  toMillimetres,
  type Water,
} from "./pressure.ts"
import { intDiv, lrint } from "./round.ts"

// Maximum operating depth in metres for a maximum PO₂ in bar, following
// Subsurface's gas_mod (core/dive.cpp) in integer mbar and mm. Subsurface
// rounds to whole metres for its cylinder table; Shylog keeps 0.1 m steps,
// still rounding down except within 0.01 m of the next step.
export function mod(oxygen: number, maxPo2: number, water: Water): number {
  const ambient = intDiv(lrint(maxPo2 * 1000) * 1000, oxygen)
  const depth = lrint(
    (ambient - surfacePressure(water)) / specificWeight(water)
  )
  return Math.trunc(depth / 100 + 0.1) / 10
}

// PO₂ in bar, to the mbar, if the dive's one gas was breathed at its
// deepest point.
export const maxPo2 = (oxygen: number, maxDepth: number, water: Water) =>
  lrint((oxygen * depthToMbar(toMillimetres(maxDepth), water)) / 1000) / 1000
