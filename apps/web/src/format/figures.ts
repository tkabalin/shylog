import { tenthsToPercent } from "@shylog/core"

// Figures as the app shows them, without units, which the screens set in a
// smaller size. Metric throughout, as the database stores it.

// One decimal: 32.66 → "32.7".
export const depth = (metres: number) => metres.toFixed(1)

// Whole minutes, to the nearest: 2500 s → "42".
export const minutes = (seconds: number) => String(Math.round(seconds / 60))

// The Log header's whole hours underwater.
export const hours = (seconds: number) => String(Math.round(seconds / 3600))

// A surface interval as hours and minutes: "2 h 10 min", "45 min".
export function interval(seconds: number) {
  const total = Math.round(seconds / 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h ? `${h} h ${m} min` : `${m} min`
}

// Temperatures keep a decimal only when they have one: "22", "22.5", and
// take a real minus sign: "−1.9".
export const temperature = (celsius: number) =>
  String(Math.round(celsius * 10) / 10).replace("-", "−")

export function temperatureRange(min: number | null, max: number | null) {
  if (min == null && max == null) return null
  if (min == null || max == null || min === max)
    return temperature((min ?? max)!)
  return `${temperature(min)}–${temperature(max)}`
}

// Millilitres as litres: 11100 → "11.1", 12000 → "12".
export const litres = (millilitres: number) =>
  String(Math.round(millilitres / 100) / 10)

// A gas from its oxygen in tenths of a per cent, null meaning air.
export const gasName = (oxygen: number | null) =>
  oxygen == null ? "Air" : `EANx${tenthsToPercent(oxygen)}`
export const gasDetail = (oxygen: number | null) =>
  oxygen == null ? "Air" : `Nitrox ${tenthsToPercent(oxygen).toFixed(1)}%`

// Two decimals of bar, as Subsurface shows PO₂: 1.381 → "1.38".
export const bar = (value: number) => value.toFixed(2)
