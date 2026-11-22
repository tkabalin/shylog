import { airOxygen } from "./gas.ts"
import {
  depthToMbar,
  specificWeight,
  surfacePressure,
  type Water,
} from "./pressure.ts"
import { intDiv, lrint } from "./round.ts"

// Bühlmann ZHL-16C for nitrogen, as Subsurface has it in core/deco.cpp.
const nitrogenA = [
  1.1696, 1.0, 0.8618, 0.7562, 0.62, 0.5043, 0.441, 0.4, 0.375, 0.35, 0.3295,
  0.3065, 0.2835, 0.261, 0.248, 0.2327,
]
const nitrogenB = [
  0.5578, 0.6514, 0.7222, 0.7825, 0.8126, 0.8434, 0.8693, 0.891, 0.9092, 0.9222,
  0.9319, 0.9403, 0.9477, 0.9544, 0.9602, 0.9653,
]
const halfLife = [
  5.0, 8.0, 12.5, 18.5, 27.0, 38.3, 54.3, 77.0, 109.0, 146.0, 187.0, 239.0,
  305.0, 390.0, 498.0, 635.0,
]
// Subsurface's precomputed 1 - exp(-ln 2 / (half-life in s)), which the
// descent uses second by second; longer steps work it out each time.
const oneSecond = [
  2.30782347297664e-3, 1.44301447809736e-3, 9.23769302935806e-4,
  6.24261986779007e-4, 4.2777710724673e-4, 3.01585140931371e-4,
  2.12729727268379e-4, 1.50020603047807e-4, 1.05980191127841e-4,
  7.91232600646508e-5, 6.17759153688224e-5, 4.83354552742732e-5,
  3.78761777920511e-5, 2.96212356654113e-5, 2.31974277413727e-5,
  1.81926738960225e-5,
]
// Bühlmann's water vapour pressure in bar (WV_PRESSURE).
const waterVapour = 0.0627
// Tissues start at the surface with N2_IN_AIR, 78.1 %, though air in the
// lungs is 79.1 % nitrogen: Subsurface's own constant, kept.
const nitrogenInAir = 781

// The planner's defaults (core/pref.cpp, core/planner.cpp): down at
// 18 m/min, up at 9 m/min at every depth, the bottom extended a minute at a
// time, the ascent tested in 2 s steps, and nothing past 6 hours.
const descentRate = 300
const ascentRate = 150
const bottomStep = 60
const ascentStep = 2
const longest = 6 * 3600

// Gradient factors in per cent, low then high, as Subsurface's planner
// takes them.
export interface GradientFactors {
  low: number
  high: number
}

interface Tissues {
  nitrogen: number[]
  // gf_low_pressure_this_dive: where GF low applies, in bar.
  gfLowPressure: number
}

// factor in core/deco.cpp, worked out once per step length: the same
// expression gives the same bits, and the exp calls were most of the time.
const factors = new Map<number, number[]>([[1, oneSecond]])
function factorsFor(seconds: number) {
  let found = factors.get(seconds)
  if (!found) {
    found = halfLife.map(
      (life) => 1.0 - Math.exp((-seconds * 1.155245301e-2) / life)
    )
    factors.set(seconds, found)
  }
  return found
}

// add_segment for open circuit and no helium.
function addSegment(
  tissues: Tissues,
  bar: number,
  oxygen: number,
  seconds: number
) {
  const nitrogen = ((1000 - oxygen) / 1000.0) * (bar - waterVapour)
  const factor = factorsFor(seconds)
  for (let i = 0; i < 16; i++) {
    const oversaturation = nitrogen - tissues.nitrogen[i]!
    tissues.nitrogen[i]! += 1.0 * oversaturation * factor[i]!
  }
}

// Scratch for tolerance's per-tissue coefficients, which it runs often.
const a = new Float64Array(16)
const b = new Float64Array(16)

// tissue_tolerance_calc's Bühlmann branch: the lowest ambient pressure in
// bar every tissue tolerates, with GF low at the deepest ceiling and GF
// high at the surface. It raises gfLowPressure, as Subsurface's does.
function tolerance(tissues: Tissues, gf: GradientFactors, surface: number) {
  const low = gf.low / 100
  const high = gf.high / 100
  let lowestCeiling = 0.0
  for (let i = 0; i < 16; i++) {
    const t = tissues.nitrogen[i]!
    // Helium's terms are 0, but they still go through the division, which
    // can move a coefficient by its last bit.
    a[i] = (nitrogenA[i]! * t + 0) / t
    b[i] = (nitrogenB[i]! * t + 0) / t
    const ceiling =
      (b[i]! * t - low * a[i]! * b[i]!) / ((1.0 - b[i]!) * low + b[i]!)
    if (ceiling > lowestCeiling) lowestCeiling = ceiling
    if (lowestCeiling > tissues.gfLowPressure)
      tissues.gfLowPressure = lowestCeiling
  }
  const g = tissues.gfLowPressure
  let limit = 0.0
  for (let i = 0; i < 16; i++) {
    const ai = a[i]!
    const bi = b[i]!
    const t = tissues.nitrogen[i]!
    const tolerated =
      (surface / bi + ai - surface) * high + surface <
      (g / bi + ai - g) * low + g
        ? (-ai * bi * (high * g - low * surface) -
            (1.0 - bi) * (high - low) * g * surface +
            bi * (g - surface) * t) /
          (-ai * bi * (high - low) +
            (1.0 - bi) * (low * g - high * surface) +
            bi * (g - surface))
        : limit
    if (tolerated >= limit) limit = tolerated
  }
  return limit
}

// Seconds from leaving the surface that a diver can stay at `depth` mm and
// still swim straight up, as Subsurface's planner has it in Recreational
// mode (plan in core/planner.cpp). 0 when even the descent needs a stop,
// null past the planner's 6 hours.
export function noStopTime(
  oxygen: number,
  depth: number,
  gf: GradientFactors,
  water: Water
): number | null {
  const surfaceMbar = surfacePressure(water)
  const surface = surfaceMbar / 1000.0
  const bar = (mm: number) => depthToMbar(mm, water) / 1000.0
  const tissues: Tissues = {
    nitrogen: Array<number>(16).fill(
      ((surface - waterVapour) * nitrogenInAir) / 1000
    ),
    gfLowPressure: surface + 1.0,
  }
  // init_decompression's call, kept for gfLowPressure.
  tolerance(tissues, gf, surface)

  // The descent as the planner draws it, then breathed a second at a time
  // (interpolate_transition).
  const descent = intDiv(depth, descentRate)
  for (let second = 0; second < descent; second++) {
    const reached = lrint((depth * second) / descent)
    addSegment(tissues, bar(reached), oxygen, 1)
  }

  // trial_ascent: up at 9 m/min, failing where the ceiling passes the next
  // step; the tissues are put back afterwards.
  const clearToSurface = () => {
    const kept = {
      nitrogen: [...tissues.nitrogen],
      gfLow: tissues.gfLowPressure,
    }
    let at = depth
    let clear = true
    while (at > 0) {
      const step = Math.min(ascentRate * ascentStep, at)
      addSegment(tissues, bar(at), oxygen, ascentStep)
      const limit = tolerance(tissues, gf, surface)
      const over = limit > surface ? limit - surface : 0.0
      const ceiling = lrint(lrint(over * 1000) / specificWeight(water))
      if (ceiling > at - step) {
        clear = false
        break
      }
      at -= step
    }
    tissues.nitrogen = kept.nitrogen
    tissues.gfLowPressure = kept.gfLow
    return clear
  }

  if (!clearToSurface()) return 0
  let clock = descent
  for (;;) {
    addSegment(tissues, bar(depth), oxygen, bottomStep)
    clock += bottomStep
    if (!clearToSurface()) break
    if (clock >= longest) return null
  }
  return clock - bottomStep
}

// US Navy Diving Manual, Revision 7, Table 9-7: no-stop limits in minutes
// by depth in feet of sea water; null is unlimited. Past 190 fsw no dive is
// without stops.
const navyTable: [number, number | null][] = [
  [10, null],
  [15, null],
  [20, null],
  [25, 1102],
  [30, 371],
  [35, 232],
  [40, 163],
  [45, 125],
  [50, 92],
  [55, 74],
  [60, 63],
  [70, 48],
  [80, 39],
  [90, 33],
  [100, 25],
  [110, 20],
  [120, 15],
  [130, 12],
  [140, 10],
  [150, 8],
  [160, 7],
  [170, 6],
  [180, 6],
  [190, 5],
]

// The Navy's no-stop limit in minutes for `depth` mm: air from the table
// at the next row as deep or deeper, nitrox at its equivalent air depth
// (Chapter 10), as the table is for air of 79 % nitrogen. 0 past the
// table, null for no limit.
export function navyNoStopTime(oxygen: number, depth: number): number | null {
  const feet = depth / 304.8
  const ead =
    oxygen === airOxygen
      ? feet
      : ((feet + 33) * ((1000 - oxygen) / 1000)) / 0.79 - 33
  // A hair of tolerance, so 30.48 m reads the 100 fsw row and not 110.
  const row = navyTable.find(([fsw]) => ead <= fsw + 1e-9)
  return row ? row[1] : 0
}

// The richest nitrox, in tenths of a per cent, that stays within `maxPo2`
// bar at `depth` mm: Subsurface's best_o2 (core/dive.cpp), which rounds
// down to a whole per cent, kept to the tenth here, still rounding down.
export function bestMix(depth: number, maxPo2: number, water: Water) {
  return Math.min(
    intDiv(lrint(maxPo2 * 1000) * 1000, depthToMbar(depth, water)),
    1000
  )
}
