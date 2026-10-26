import {
  chartEnd,
  chartPoints,
  deepestPoint,
  depthLabels,
  labelInterval,
  modInView,
  pointsInView,
  temperatureAxis,
  temperatureLabels,
  timeAxis,
  verticalSpeeds,
  type ChartPoint,
  type TemperatureLabel,
} from "@shylog/core"

import type { Profile } from "@/api/client"

import {
  chartDepthAxis,
  depthLabelWidth,
  plotHeight as cardPlotHeight,
  plotTop,
  timeAxisHeight,
  timeLabelWidth,
} from "./layout"

export type ProfileEvent = Profile["events"][number]

export interface Alarm {
  event: ProfileEvent
  // Chart points at the alarm's start and end.
  from: ChartPoint
  to: ChartPoint
  // The fastest single-step ascent inside it, m/min, and where it is.
  peak: number
  peakIndex: number
}

// Everything the chart draws for one dive at one plot size, from core's rules
// (see Profile chart in the spec): points in view with their speeds, the
// axes, labelled depths and temperatures, events, alarms and the MOD line.
export function profileModel(
  { samples, events: sent }: Profile,
  { maxDepth, mod }: { maxDepth: number; mod: number | null },
  width: number,
  plotHeight = cardPlotHeight
) {
  // In time order, as the markers' label spacing assumes; an end before
  // its start would hide the event from the crosshair.
  const events = sent
    .map((event) =>
      event.end != null && event.end < event.start
        ? { ...event, end: event.start }
        : event
    )
    .sort((a, b) => a.start - b.start)
  // Every alarm sample is an event in Subsurface, so an alarm's end is too.
  const eventTimes = events.flatMap((event) =>
    event.end == null ? [event.start] : [event.start, event.end]
  )
  const all = chartPoints(samples, eventTimes)
  const time = timeAxis(chartEnd(samples, eventTimes), width, timeLabelWidth, {
    zoomed: true,
  })
  const inView = pointsInView(all, time.max)
  const depth = chartDepthAxis(deepestPoint(maxDepth, all), {
    zoomed: true,
    height: plotHeight,
  })
  const interval = labelInterval(depthLabelWidth, time, width)

  const speeds = verticalSpeeds(all).slice(0, inView)
  const points = all.slice(0, inView)
  // The last point past the axis is cut at its end.
  const last = points.at(-1)!
  const before = points.at(-2)
  if (before && last.time > time.max) {
    const part = (time.max - before.time) / (last.time - before.time)
    points[points.length - 1] = {
      ...last,
      time: time.max,
      depth: before.depth + (last.depth - before.depth) * part,
    }
  }

  const shown = events.filter((event) => event.type !== "surface")
  const at = (seconds: number) => pointAt(points, seconds)
  const alarms: Alarm[] = shown
    .filter((event) => event.type === "ascent")
    .map((event) => {
      const start = at(event.start)
      const end = event.end == null ? start : at(event.end)
      let peakIndex = start
      for (let i = start + 1; i <= end; i++) {
        if (speeds[i].speed < speeds[peakIndex].speed) peakIndex = i
      }
      return {
        event,
        from: points[start],
        to: points[end],
        peak: rate(speeds[peakIndex].speed),
        peakIndex,
      }
    })

  // The crosshair rests on the deepest point until touched.
  let deepest = 0
  for (let i = 1; i < points.length; i++) {
    if (points[i].depth > points[deepest].depth) deepest = i
  }

  const temperature = temperatureAxis(points)
  // An event drawn at least 6 px wide, so a one-second alarm still shows;
  // the readout names it for as long as the crosshair is on that band.
  const minSpan = (6 * time.max) / width
  const eventEnd = (event: ProfileEvent) =>
    Math.max(event.end ?? event.start, event.start + minSpan)
  return {
    plotHeight,
    // The depth chart's whole height: the event band, the plot, the times.
    chartHeight: plotTop + plotHeight + timeAxisHeight,
    eventEnd,
    points,
    speeds,
    time,
    depth,
    // The lane's axis, at least 2 °C tall, and the range the water had.
    temperature,
    water: temperature && { min: temperature.min, max: temperature.highest },
    depthLabels: depthLabels(all, inView, interval),
    temperatureLabels: firstOfEach(
      temperatureLabels(all, inView, time.max, interval)
    ),
    events: shown,
    alarms,
    mod: modInView(mod, depth) ? mod : null,
    deepest,
  }
}

export type ProfileModel = ReturnType<typeof profileModel>

// Each temperature labelled only the first time Subsurface's rule picks it:
// the lane's steps show a return to a level, so repeats add only clutter.
// Compared in whole tenths, as the labels show them.
function firstOfEach(labels: readonly TemperatureLabel[]) {
  const seen = new Set<number>()
  return labels.filter((label) => {
    const tenths = Math.round(label.temperature * 10)
    if (seen.has(tenths)) return false
    seen.add(tenths)
    return true
  })
}

// The crosshair's point: the first at or after a time (as Subsurface's
// tooltip picks it), or the last.
export function pointAt(points: readonly ChartPoint[], seconds: number) {
  const index = points.findIndex((point) => point.time >= seconds)
  return index === -1 ? points.length - 1 : index
}

// Vertical rate in m/min from core's truncated mm/s, positive ascending,
// so it moves in steps of 0.06 m/min.
export const rate = (speed: number) => (-speed * 60) / 1000 + 0

// Events whose span holds a time: as recorded by default, or as drawn
// when given the model's `eventEnd`. Where a widened band overlaps the next
// alarm, the one recorded at that time comes first.
const recorded = (event: ProfileEvent) => event.end ?? event.start
export const eventsAt = (
  events: readonly ProfileEvent[],
  seconds: number,
  end = recorded
) => {
  const holds = (to: typeof end) => (event: ProfileEvent) =>
    event.start <= seconds && seconds <= to(event)
  const on = events.filter(holds(end))
  return [
    ...on.filter(holds(recorded)),
    ...on.filter((e) => !holds(recorded)(e)),
  ]
}

// UDDF's alarm types as words: "rbt" is remaining bottom time.
const eventNames: Record<string, string> = { ascent: "Ascent", rbt: "RBT" }
export const eventLabel = (type: string) =>
  eventNames[type] ?? type.charAt(0).toUpperCase() + type.slice(1)
