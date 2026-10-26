import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react"
import { speedBand, speedBands } from "@shylog/core"
import { IconAlertTriangle } from "@tabler/icons-react"
import { cn } from "cn"

import type { Profile as ProfileData } from "@/api/client"
import type { Dive } from "@/data/db"
import { depth, temperature, temperatureRange } from "@/format/figures"

import { Alarms } from "./alarms"
import { Crosshair } from "./crosshair"
import { DepthChart } from "./depth-chart"
import { clock, rateLabel } from "./format"
import { laneHeaderHeight, laneHeight, plotLeft, readoutHeight } from "./layout"
import {
  eventLabel,
  eventsAt,
  pointAt,
  profileModel,
  rate,
  type Alarm,
} from "./model"
import { ProfileTable } from "./profile-table"
import { TemperatureLane } from "./temperature-lane"

// The Profile card's body, the chart's lazy chunk: the crosshair readout,
// the depth chart, the temperature lane, the alarms and the table
// alternative, drawn once the card has the dive's samples.
export default function Profile({
  dive,
  mod,
  profile,
}: {
  dive: Dive
  mod: number | null
  profile: ProfileData
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = ref.current!
    const observer = new ResizeObserver(() =>
      setWidth(Math.round(element.getBoundingClientRect().width))
    )
    observer.observe(element)
    setWidth(Math.round(element.getBoundingClientRect().width))
    return () => observer.disconnect()
  }, [])
  const model = useMemo(
    () =>
      width
        ? profileModel(
            profile,
            { maxDepth: dive.maxDepth, mod },
            width - plotLeft
          )
        : null,
    [profile, dive.maxDepth, mod, width]
  )
  // Null rests the crosshair on the deepest point.
  const [chosen, setChosen] = useState<number | null>(null)
  const index = model
    ? Math.min(chosen ?? model.deepest, model.points.length - 1)
    : 0

  // A tap moves the crosshair and a sideways drag scrubs; a vertical swipe
  // is left to the page (touch-action: pan-y). A mouse follows on hover.
  // Once a drag has gone sideways it keeps scrubbing, however it drifts.
  const start = useRef<{ x: number; y: number } | null>(null)
  const scrubbing = useRef(false)
  const scrub = (event: PointerEvent<HTMLDivElement>) => {
    if (!model) return
    // Measured within the plot, right of the depth labels' gutter.
    const box = event.currentTarget.getBoundingClientRect()
    const part = (event.clientX - box.left - plotLeft) / (box.width - plotLeft)
    const seconds = Math.min(Math.max(part, 0), 1) * model.time.max
    setChosen(pointAt(model.points, seconds))
  }
  const touch = {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (event.pointerType === "mouse") scrub(event)
      else start.current = { x: event.clientX, y: event.clientY }
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const from = start.current
      // A few pixels of slop first, so a swipe's first sideways jitter
      // doesn't scrub before the page takes the scroll.
      const sideways = from ? Math.abs(event.clientX - from.x) : 0
      if (from && sideways > 6 && sideways > Math.abs(event.clientY - from.y))
        scrubbing.current = true
      if (event.pointerType === "mouse" || scrubbing.current) scrub(event)
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      if (event.pointerType !== "mouse" && start.current) scrub(event)
      start.current = null
      scrubbing.current = false
    },
    onPointerCancel() {
      start.current = null
      scrubbing.current = false
    },
  }
  const show = useCallback((alarm: Alarm) => setChosen(alarm.peakIndex), [])

  const point = model?.points[index]
  const speed = model?.speeds[index].speed ?? 0
  const band = speedBand(speed)
  const strong = speedBands.indexOf(band) >= speedBands.indexOf("moderate")
  // One line at most, so the readout keeps its height.
  const now = model && point ? eventsAt(model.events, point.time)[0] : null

  return (
    <div
      ref={ref}
      data-slot="profile"
      // Fades in from @starting-style, opacity only. A long press while
      // scrubbing selects nothing and shows no callout.
      className="flex flex-col gap-3 select-none [-webkit-touch-callout:none] motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-out motion-safe:starting:opacity-0"
    >
      <div
        aria-hidden
        data-slot="readout"
        className="flex items-end justify-between"
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

      <div className="relative isolate">
        {model && (
          <>
            <Crosshair model={model} index={index} width={width} layer="line" />
            <DepthChart model={model} width={width} />
            <Crosshair model={model} index={index} width={width} layer="dot" />
          </>
        )}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 bottom-7.5 cursor-crosshair touch-pan-y"
          {...touch}
        />
      </div>

      <div className="-mt-1 flex flex-col gap-1.5">
        <div
          aria-hidden
          className="flex items-baseline justify-between text-xs text-muted-foreground tabular-nums"
          style={{ height: laneHeaderHeight }}
        >
          <span>
            Water temperature
            {model?.water &&
              ` · ${temperatureRange(model.water.min, model.water.max)} °C`}
          </span>
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
                className="absolute inset-0 cursor-crosshair touch-pan-y"
                {...touch}
              />
            </>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              No water temperature recorded.
            </p>
          )}
        </div>
      </div>

      {model && (
        <>
          <Alarms alarms={model.alarms} onShow={show} />
          <ProfileTable model={model} />
        </>
      )}
    </div>
  )
}
