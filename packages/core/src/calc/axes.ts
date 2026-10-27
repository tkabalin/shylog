import { intDiv, lrint } from "./round.ts"
import type { ChartPoint } from "./velocity.ts"
import { axisTicks, type AxisTicks } from "./ticks.ts"

// get_maxtime and get_maxdepth (core/profile.cpp): by default a short or
// shallow dive doesn't fill the whole chart. Subsurface's zoomed plot,
// which the detail chart uses, fits the dive with no depth floor.
export const minChartTime = 30 * 60
export const zoomedMinChartTime = 30
export const minChartDepth = 30_000

export interface AxisOptions {
  zoomed?: boolean
}

// The time axis, 0 to the chart's end (chartEnd) or 30 min (30 s zoomed),
// its ticks inside those exact bounds. Sizes are in pixels; the label is
// the widest one, "99.99" in Subsurface.
export const timeAxis = (
  end: number,
  width: number,
  labelWidth: number,
  { zoomed = false }: AxisOptions = {}
) =>
  axisTicks({
    min: 0,
    max: Math.max(zoomed ? zoomedMinChartTime : minChartTime, end),
    scale: 1 / 60,
    size: width,
    space: labelWidth * 1.5,
    decimals: 2,
    time: true,
  })!

// The depth axis in mm, surface to the deepest point plus 3 m (at least
// 30 m unless zoomed), its end rounded up to the next tick.
export const depthAxis = (
  deepest: number,
  height: number,
  labelHeight: number,
  { zoomed = false }: AxisOptions = {}
) =>
  axisTicks({
    min: 0,
    max: zoomed ? deepest + 3000 : Math.max(minChartDepth, deepest + 3000),
    scale: 0.001,
    size: height,
    space: labelHeight * 2,
    decimals: 0,
    time: false,
  })!

// The deepest point in mm: the dive's recorded maximum or any point deeper.
export const deepestPoint = (maxDepth: number, points: readonly ChartPoint[]) =>
  Math.max(lrint(maxDepth * 1000), ...points.map((point) => point.depth))

// The temperature lane's range in °C, lowest to highest point, widened to
// 2 °C as plotDive does, compared in whole mK as Subsurface keeps them; and
// the highest reading itself. Null with no temperatures.
export function temperatureAxis(points: readonly ChartPoint[]) {
  const temperatures = points.flatMap((point) =>
    point.temperature == null ? [] : [point.temperature]
  )
  if (!temperatures.length) return null
  const min = Math.min(...temperatures)
  const highest = Math.max(...temperatures)
  const span = lrint(highest * 1000) - lrint(min * 1000)
  return { min, max: span > 2000 ? highest : min + 2, highest }
}

// Seconds that three label widths cover on the time axis, rounded up, as
// getMinLabelDistance gives the peak labels' spacing.
export const labelInterval = (
  labelWidth: number,
  axis: AxisTicks,
  width: number
) => Math.ceil((labelWidth * 3 * (axis.max - axis.min)) / width)

// textForValue: whole minutes, or m:ss when under 10 minutes are in view.
// Subsurface truncates the seconds but rounds the minutes, so a tick that
// drifted to 119.9999 s would read 2:59; Shylog rounds both.
export function timeLabel(seconds: number, axis: AxisTicks) {
  const whole = lrint(seconds)
  const minutes = intDiv(whole, 60)
  if (axis.max - axis.min >= 600) return String(minutes)
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`
}

// The MOD line is drawn only inside the depth axis, which it never widens.
export const modInView = (mod: number | null, axis: AxisTicks) =>
  mod != null && lrint(mod * 1000) <= axis.max
