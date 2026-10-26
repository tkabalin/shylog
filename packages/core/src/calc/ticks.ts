import { lrint } from "./round.ts"

// A tidy tick step in display units, as sensibleInterval
// (profile-widget/divecartesianaxis.cpp) picks it. Under an hour, time steps
// are a whole fraction of an hour or a minute; anything else is 1, 2, 4, 5
// or 10 times a power of ten, never finer than the decimals shown.
export function niceStep(step: number, decimals: number, time: boolean) {
  if (time && step < 60) {
    const ofHour = step > 1
    const part = ofHour ? step / 60 : step
    const nice =
      part <= 1 / 12 ? 1 / 12 : part <= 1 / 6 ? 1 / 6 : 1 / Math.floor(1 / part)
    return ofHour ? nice * 60 : nice
  }
  let digits = Math.floor(Math.log10(step))
  if (digits < -decimals) digits = -decimals
  const factor = Math.pow(10, digits)
  let leading = Math.max(Math.ceil(step / factor), 1)
  if (leading > 5) leading = 10
  if (leading === 3) leading = 4
  return leading * factor
}

export interface AxisTicks {
  // The axis's bounds after rounding, in its own units.
  min: number
  max: number
  values: number[]
}

export interface AxisSpec {
  // Bounds in the axis's own units (seconds, mm).
  min: number
  max: number
  // Display units per axis unit: 1/60 for minutes, 0.001 for metres.
  scale: number
  // Pixels along the axis, and pixels each tick needs: 1.5 label widths
  // across, 2 label heights down.
  size: number
  space: number
  decimals: number
  time: boolean
}

// DiveCartesianAxis::updateTicks: a tick count from the space, a tidy step,
// then the time axis keeps its bounds with ticks inside while other axes
// round theirs out to whole steps. Null when the axis has no range.
export function axisTicks(axis: AxisSpec): AxisTicks | null {
  const { min, max, scale, size, space, decimals, time } = axis
  if (max - min < 1e-5) return null
  const count = Math.min(Math.max(lrint(size / space), 2), 50)
  const step = niceStep(((max - min) / count) * scale, decimals, time)
  const minDisplay = scale * min
  const maxDisplay = scale * max
  let first: number
  let last: number
  let from = min
  let to = max
  if (time) {
    first = Math.ceil((minDisplay / step) * (1 - 1e-5)) * step
    last = Math.floor((maxDisplay / step) * (1 + 1e-5)) * step
  } else {
    first = Math.floor((minDisplay / step) * (1 + 1e-5)) * step
    last = Math.ceil((maxDisplay / step) * (1 - 1e-5)) * step
    from = first / scale
    to = last / scale
  }
  const ticks = Math.max(lrint((last - first) / step) + 1, 0)
  if (!ticks) return null
  const stepValue = time
    ? step / scale
    : ticks > 1
      ? (to - from) / (ticks - 1)
      : 0
  const values: number[] = []
  // Summed as Subsurface does, so a value can drift by a rounding error.
  for (let i = 0, value = time ? first / scale : from; i < ticks; i++) {
    values.push(value)
    value += stepValue
  }
  return { min: from, max: to, values }
}
