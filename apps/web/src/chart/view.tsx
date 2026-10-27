import { useRef, useState, type PointerEvent } from "react"
import { speedBand, speedBands } from "@shylog/core"
import { IconAlertTriangle } from "@tabler/icons-react"
import { cn } from "cn"

import { depth, temperature } from "@/format/figures"

import { Crosshair } from "./crosshair"
import { DepthChart } from "./depth-chart"
import { clock, rateLabel } from "./format"
import { laneHeaderHeight, laneHeight, plotLeft, readoutHeight } from "./layout"
import { eventLabel, eventsAt, pointAt, rate, type ProfileModel } from "./model"
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
  const [chosen, setChosen] = useState<number | null>(null)
  const index = model
    ? Math.min(chosen ?? model.deepest, model.points.length - 1)
    : 0
  const start = useRef<{ x: number; y: number } | null>(null)
  const scrubbing = useRef(false)

  const scrub = (event: PointerEvent<HTMLDivElement>) => {
    if (!model) return
    // Measured within the plot, past the depth labels' gutter.
    const box = event.currentTarget.getBoundingClientRect()
    const part = turned
      ? (event.clientY - box.top - plotLeft) / (box.height - plotLeft)
      : (event.clientX - box.left - plotLeft) / (box.width - plotLeft)
    const seconds = Math.min(Math.max(part, 0), 1) * model.time.max
    setChosen(pointAt(model.points, seconds))
  }
  const handlers = {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (free || event.pointerType === "mouse") scrub(event)
      else start.current = { x: event.clientX, y: event.clientY }
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const from = start.current
      // A few pixels of slop first, so a swipe's first sideways jitter
      // doesn't scrub before the page takes the scroll; once sideways, it
      // keeps scrubbing however the finger drifts.
      const sideways = from ? Math.abs(event.clientX - from.x) : 0
      if (from && sideways > 6 && sideways > Math.abs(event.clientY - from.y))
        scrubbing.current = true
      // A touch moves only while down, so full screen any move scrubs.
      if (event.pointerType === "mouse" || scrubbing.current || free)
        scrub(event)
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      if (!free && event.pointerType !== "mouse" && start.current) scrub(event)
      start.current = null
      scrubbing.current = false
    },
    onPointerCancel() {
      start.current = null
      scrubbing.current = false
    },
  }
  return { index, setChosen, handlers }
}

// The crosshair's point: depth and time, any alarm it sits in, the rate.
export function Readout({
  model,
  index,
  className,
}: {
  model: ProfileModel | null
  index: number
  className?: string
}) {
  const point = model?.points[index]
  const speed = model?.speeds[index].speed ?? 0
  const band = speedBand(speed)
  const strong = speedBands.indexOf(band) >= speedBands.indexOf("moderate")
  // One line at most, so the readout keeps its height.
  const now =
    model && point
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
            {now && (
              <span className="inline-flex items-center gap-1 font-semibold text-warn">
                <IconAlertTriangle className="size-3.25 stroke-[2.25]" />
                {eventLabel(now.type)} alarm
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
// that leaves the time labels alone.
export function DepthView({
  model,
  index,
  width,
  handlers,
  free = false,
}: {
  model: ProfileModel
  index: number
  width: number
  handlers: Handlers
  free?: boolean
}) {
  return (
    <div className="relative isolate">
      <Crosshair model={model} index={index} width={width} layer="line" />
      <DepthChart model={model} width={width} />
      <Crosshair model={model} index={index} width={width} layer="dot" />
      <div
        aria-hidden
        className={cn(overlay(free), "inset-x-0 top-0 bottom-7.5")}
        {...handlers}
      />
    </div>
  )
}

// The temperature lane under its header, which names the range and the
// crosshair's reading.
export function LaneView({
  model,
  index,
  width,
  handlers,
  free = false,
}: {
  model: ProfileModel | null
  index: number
  width: number
  handlers: Handlers
  free?: boolean
}) {
  const point = model?.points[index]
  return (
    <div className="-mt-1 flex flex-col gap-1.5">
      <div
        aria-hidden
        className="flex items-baseline justify-between text-xs text-muted-foreground tabular-nums"
        style={{ height: laneHeaderHeight }}
      >
        <span>Water temperature</span>
        {point?.temperature != null && (
          <span className="font-medium text-foreground">
            {temperature(point.temperature)} °C
          </span>
        )}
      </div>
      <div className="relative isolate" style={{ height: laneHeight }}>
        {model?.temperature ? (
          <>
            <Crosshair
              model={model}
              index={index}
              width={width}
              lane
              layer="line"
            />
            <TemperatureLane model={model} width={width} />
            <Crosshair
              model={model}
              index={index}
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
