// Conversions between the app's units, the database's and the UDDF export's
// (SI). Depth, weight and coordinates are the same in all three. Integer
// database units round, so a typed 32.4 % is always exactly 324.

// Gas: tenths of a per cent in the database, % in the app, 0 to 1 in UDDF.
export const percentToTenths = (percent: number) => Math.round(percent * 10)
export const tenthsToPercent = (tenths: number) => tenths / 10
export const tenthsToFraction = (tenths: number) => tenths / 1000
export const fractionToTenths = (fraction: number) =>
  Math.round(fraction * 1000)

// Cylinder volume: millilitres in the database, litres in the app, m³ in UDDF.
export const litresToMillilitres = (litres: number) => Math.round(litres * 1000)
export const millilitresToLitres = (ml: number) => ml / 1000
export const millilitresToCubicMetres = (ml: number) => ml / 1_000_000
export const cubicMetresToMillilitres = (m3: number) =>
  Math.round(m3 * 1_000_000)

// Temperature: °C in the database and app, kelvin in UDDF. Rounded to the
// millikelvin Subsurface works in, which also hides binary float error.
const toMilli = (value: number) => Math.round(value * 1000) / 1000
export const celsiusToKelvin = (celsius: number) => toMilli(celsius + 273.15)
export const kelvinToCelsius = (kelvin: number) => toMilli(kelvin - 273.15)

// Pressure: bar in the database and app, pascals in UDDF.
export const barToPascals = (bar: number) => Math.round(bar * 100_000)
export const pascalsToBar = (pascals: number) => toMilli(pascals / 100_000)

// Duration: seconds in the database and UDDF, minutes in the app.
export const minutesToSeconds = (minutes: number) => Math.round(minutes * 60)
export const secondsToMinutes = (seconds: number) => seconds / 60

// The decimal separator follows the phone's region, so a comma is read as a
// point. Anything else, thousands separators included, is not a number.
export function parseDecimal(text: string): number | null {
  const value = text.trim().replace(",", ".")
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(value)) return null
  // "-0" would otherwise be kept and shown as -0 °C.
  return Number(value) || 0
}

// Whole-number fields (duration, pressures) take digits only, so "4,5" in
// one is a mistake rather than 4.5.
export function parseWhole(text: string): number | null {
  const value = text.trim()
  return /^\d+$/.test(value) ? Number(value) : null
}
