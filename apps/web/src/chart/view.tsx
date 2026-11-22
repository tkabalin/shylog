import { useCallback, useState, type PointerEvent } from "react"
import { speedBand, speedBands } from "@shylog/core"
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconHandStop,
  IconStairsUp,
} from "@tabler/icons-react"
import { cn } from "cn"

import { depth, temperature } from "@/format/figures"

import {
  Crosshair,
  cursor as newCursor,
  useIndex,
  type Cursor,
} from "./crosshair"
import { DepthChart } from "./depth-chart"
import { clock, rateLabel } from "./format"
import { laneHeaderHeight, laneHeight, readoutHeight } from "./layout"
import {
  eventLabel,
  eventsAt,
  inStop,
  mandatoryAt,
  mandatoryLabel,
  pointAt,
  rate,
  stopLabel,
  stopTone,
  type ProfileModel,
} from "./model"
import { LineMenu } from "./line-menu"
import { useScrub } from "./scrub"
import { TemperatureLane } from "./temperature-lane"

// The pieces the Profile card and the full-screen chart share: the
// crosshair's state and pointer handling, the readout, the depth chart and
// the temperature lane, each under its crosshair.

export type Handlers = ReturnType<typeof useCrosshair>["handlers"]

// Rests on the deepest point (null) until moved. On the card a tap moves it
// and a sideways drag scrubs (vertical swipes scroll); full screen (`free`)
// any drag does. `turned` reads time down the screen, for a turned view.
export function useCrosshair(
  model: ProfileModel | null,
  { free = false, turned = false } = {}
) {
  const [cursor] = useState(newCursor)
  // The same handlers while the chart stands, so nothing but the readouts
  // renders again as the crosshair moves.
  const scrub = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!model) return
      // Measured within the plot, past the depth labels' gutter.
      const box = event.currentTarget.getBoundingClientRect()
      const part = turned
        ? (event.clientY - box.top - model.left) / (box.height - model.left)
        : (event.clientX - box.left - model.left) / (box.width - model.left)
      const seconds = Math.min(Math.max(part, 0), 1) * model.time.max
      cursor.set(pointAt(model.points, seconds))
    },
    [model, turned, cursor]
  )
  const handlers = useScrub(scrub, free)
  return { cursor, handlers }
}

// The crosshair's point: depth and time, any alarm or safety stop it sits
// in, the rate.
export function Readout({
  model,
  cursor,
  className,
}: {
  model: ProfileModel | null
  cursor: Cursor
  className?: string
}) {
  const index = useIndex(model, cursor)
  const point = model?.points[index]
  const speed = model?.speeds[index].speed ?? 0
  const band = speedBand(speed)
  const strong = speedBands.indexOf(band) >= speedBands.indexOf("moderate")
  // One line at most, so the readout keeps its height. A mandatory stop's
  // moment wins, as an alarm often begins one; then an alarm, as the one to
  // notice, but not where only its widened band reaches into the stop.
  const mandatory = model && point ? mandatoryAt(model, index) : null
  const stop =
    model &&
    point &&
    !mandatory &&
    inStop(model, point.time) &&
    !eventsAt(model.events, point.time).length
      ? model.safetyStop
      : null
  const now =
    model && point && !stop && !mandatory
      ? eventsAt(model.events, point.time, model.eventEnd)[0]
      : null
  return (
    <div
      aria-hidden
      data-slot="readout"
      className={cn("flex items-end justify-between gap-4", className)}
      style={{ height: readoutHeight }}
    >
      {point && (
        <>
          <div className="flex items-baseline gap-2 tabular-nums">
            <span className="text-[26px] leading-7.5 font-semibold tracking-[-0.035em]">
              {depth(point.depth / 1000)}
              <span className="ml-0.5 text-sm font-medium tracking-normal text-muted-foreground">
                m
              </span>
            </span>
            <span className="text-[13px] text-muted-foreground">
              at {clock(point.time)}
            </span>
          </div>
          <div className="flex flex-col items-end gap-0.5 text-[13px] tabular-nums">
            {mandatory && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-semibold",
                  mandatory === "cleared" ? "text-ok" : "text-mandatory"
                )}
              >
                {mandatory === "cleared" ? (
                  <IconCircleCheck className="size-3.25 stroke-[2.25]" />
                ) : (
                  <IconHandStop className="size-3.25 stroke-[2.25]" />
                )}
                {mandatoryLabel[mandatory]}
              </span>
            )}
            {now && (
              <span className="inline-flex items-center gap-1 font-semibold text-warn">
                <IconAlertTriangle className="size-3.25 stroke-[2.25]" />
                {eventLabel(now.type)} alarm
              </span>
            )}
            {stop && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-semibold",
                  stopTone(stop)
                )}
              >
                <IconStairsUp className="size-3.25 stroke-[2.25]" />
                {stopLabel(stop)}
              </span>
            )}
            {/* From Moderate up, the band's colour marks the rate; the
                text stays a readable colour (lime and yellow aren't). */}
            <span
              className={cn(
                "inline-flex items-center gap-1.5",
                strong ? "font-semibold" : "text-muted-foreground"
              )}
            >
              {strong && (
                <span
                  className="size-2 rounded-full"
                  style={{ background: `var(--speed-${band})` }}
                />
              )}
              {rateLabel(rate(speed))} m/min
            </span>
          </div>
        </>
      )}
    </div>
  )
}

const overlay = (free: boolean) =>
  cn("absolute cursor-crosshair", free ? "touch-none" : "touch-pan-y")

// The depth chart between the crosshair's two layers, under a touch layer
// that takes in the time labels too, so a pointer just under the plot
// still moves the crosshair.
export function DepthView({
  model,
  cursor,
  width,
  handlers,
  free = false,
}: {
  model: ProfileModel
  cursor: Cursor
  width: number
  handlers: Handlers
  free?: boolean
}) {
  return (
    <div className="relative isolate">
      <Crosshair model={model} cursor={cursor} width={width} layer="line" />
      <DepthChart model={model} width={width} />
      <Crosshair model={model} cursor={cursor} width={width} layer="dot" />
      <div aria-hidden className={cn(overlay(free), "inset-0")} {...handlers} />
    </div>
  )
}

// The temperature lane under its header: the caption, which picks the line
// once there is one, and the crosshair's reading, hidden from screen
// readers as the readout is.
export function LaneView({
  model,
  cursor,
  width,
  handlers,
  free = false,
}: {
  model: ProfileModel | null
  cursor: Cursor
  width: number
  handlers: Handlers
  free?: boolean
}) {
  return (
    <div className="mt-1 flex flex-col gap-3">
      <div
        className="flex items-baseline justify-between text-xs text-muted-foreground tabular-nums"
        style={{ height: laneHeaderHeight }}
      >
        {model?.temperature ? (
          <LineMenu />
        ) : (
          <span aria-hidden>Water temperature</span>
        )}
        <LaneReading model={model} cursor={cursor} />
      </div>
      <div className="relative isolate" style={{ height: laneHeight }}>
        {model?.temperature ? (
          <>
            <Crosshair
              model={model}
              cursor={cursor}
              width={width}
              lane
              layer="line"
            />
            <TemperatureLane model={model} width={width} />
            <Crosshair
              model={model}
              cursor={cursor}
              width={width}
              lane
              layer="dot"
            />
            <div
              aria-hidden
              className={cn(overlay(free), "inset-0")}
              {...handlers}
            />
          </>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            No water temperature recorded.
          </p>
        )}
      </div>
    </div>
  )
}

// The lane's reading at the crosshair, which alone follows it.
function LaneReading({
  model,
  cursor,
}: {
  model: ProfileModel | null
  cursor: Cursor
}) {
  const index = useIndex(model, cursor)
  const point = model?.points[index]
  return (
    point?.temperature != null && (
      <span aria-hidden className="font-medium text-foreground">
        {temperature(point.temperature)} °C
      </span>
    )
  )
}
