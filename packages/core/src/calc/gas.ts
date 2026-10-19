import { lrint } from "./round.ts"

// Air is 20.9 % oxygen in every calculation, as in Subsurface, although an
// import reads it as 21 %.
export const airOxygen = 209

// Oxygen in tenths of a per cent; null for a nitrox dive with no mix, which
// the schemas never let through but a caller may still pass.
export const diveOxygen = (dive: {
  nitrox: boolean
  oxygen?: number | null
}) => (dive.nitrox ? (dive.oxygen ?? null) : airOxygen)

// Subsurface's cubic virial fit (gas_compressibility_factor in
// core/gas-model.cpp), without the leading 1. Nitrogen is everything that
// isn't oxygen, since Shylog has no helium.
const oxygenFit = [-7.18092073703e-4, 2.81852572808e-6, -1.50290620492e-9]
const nitrogenFit = [-2.19260353292e-4, 2.92844845532e-6, -2.07613482075e-9]
const virial = ([a, b, c]: number[], x: number) =>
  x * a + x * x * b + x * x * x * c

export function compressibility(oxygen: number, bar: number): number {
  const p = Math.min(Math.max(bar, 0), 500)
  const z =
    virial(oxygenFit, p) * oxygen + virial(nitrogenFit, p) * (1000 - oxygen)
  return z * 0.001 + 1
}

// Litres at 1 atm, in whole ml, held by a cylinder of `volume` ml at
// `pressure` mbar (cylinder_t::gas_volume in core/equipment.cpp).
export function gasVolume(volume: number, pressure: number, oxygen: number) {
  const bar = pressure / 1000
  return lrint((volume * ((bar / 1013) * 1000)) / compressibility(oxygen, bar))
}
