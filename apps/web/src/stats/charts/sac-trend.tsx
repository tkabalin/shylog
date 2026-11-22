import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from "react"
import {
  CartesianGrid,
  ComposedChart,
  DefaultZIndexes,
  Line,
  useXAxisScale,
  useYAxisScale,
  XAxis,
  YAxis,
  ZIndexLayer,
  type XAxisTickContentProps,
  type YAxisTickContentProps,
} from "recharts"

import { type Cursor } from "@/chart/crosshair"
import { useScrub } from "@/chart/scrub"
import { useSize } from "@/chart/size"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import type { Dive } from "@/data/db"
import type { Statistics } from "@/stats/figures"
import { numberAxis, rateScale, timeAxis } from "@/stats/trend"

import { rate } from "./parts"

const config = {
  sac: { label: "Each dive", color: "var(--muted-foreground)" },
  average: { label: "Average of last 5", color: "var(--primary)" },
} satisfies ChartConfig

// Days since 1970 for a local start time, with no time zone, so the dives
// sit on the time axis where their wall clock says.
const day = (startTime: string) =>
  Date.UTC(
    Number(startTime.slice(0, 4)),
    Number(startTime.slice(5, 7)) - 1,
    Number(startTime.slice(8, 10)),
    Number(startTime.slice(11, 13)),
    Number(startTime.slice(14, 16))
  ) / 86_400_000

// A tick's label, muted and 11 px as the other charts' are.
const tickText = "fill-muted-foreground text-[11px]"

// The SAC rate of each dive and the five-dive average, from the first rated
// dive's month to the last's, in the year or across every year.
// Plain <text> ticks, as Recharts' own measure each word in the DOM to
// wrap it, and every measure restyles the page. Memoised, so the screen's
// other state, such as the axis switch's thumb, doesn't redraw it.
export const SacTrend = memo(function SacTrend({
  trend,
  year,
  byNumber,
  cursor,
}: {
  trend: Statistics["sac"]["trend"]
  year: string | undefined
  // Along the dive numbers rather than the calendar, so a busy week and a
  // quiet year take the same room per dive.
  byNumber: boolean
  // The dive picked by a tap or scrub, which the screen's readout shows.
  cursor: Cursor
}) {
  const box = useRef<HTMLDivElement>(null)
  const { width, height } = useSize(box)
  const {
    low,
    high,
    ticks: gridlines,
  } = rateScale(
    trend.map((point) => point.sac),
    trend.map((point) => point.average)
  )
  // A rate off the top sits on the edge, drawn as a caret pointing up; the
  // averages always fit.
  // A draft has no number until it syncs, only the one it will get.
  const number = (dive: Dive) => dive.number ?? dive.provisional ?? 0
  const data = trend.map((point) => ({
    x: byNumber ? number(point.dive) : day(point.dive.startTime),
    sac: Math.min(point.sac, high),
    clamped: point.sac > high,
    rate: point.sac,
    average: point.average,
  }))
  const axis = byNumber
    ? numberAxis(number(trend[0]!.dive), number(trend.at(-1)!.dive))
    : timeAxis(trend[0]!.dive.startTime, trend.at(-1)!.dive.startTime, !!year)
  const ticks = axis.ticks.map((tick) => tick.value)
  const tickLabel = (value: number) =>
    axis.ticks.find((tick) => tick.value === value)?.label ?? ""

  // Outside React, so only the readout and marker follow a scrub, not the
  // chart. Null rests it on the latest dive; a new year or axis starts it
  // there again.
  useLayoutEffect(() => cursor.set(null), [cursor, trend, byNumber])
  // Where the dots were drawn, from the chart's own scales.
  const [placed] = useState(newPlaced)
  const pick = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const x = event.clientX - event.currentTarget.getBoundingClientRect().left
      const points = placed.points()
      let nearest = 0
      points.forEach((point, i) => {
        if (Math.abs(point.x - x) <= Math.abs(points[nearest]!.x - x))
          nearest = i
      })
      if (points.length) cursor.set(nearest)
    },
    [cursor, placed]
  )
  const handlers = useScrub(pick)

  return (
    <div
      ref={box}
      aria-hidden
      // A long press neither selects the labels nor opens a menu.
      className="relative h-42 w-full select-none [-webkit-touch-callout:none]"
    >
      {/* Drawn once at the measured width, in the first frame: a
            responsive container drew it at a guessed size, then again. */}
      {width > 0 && (
        <ChartContainer
          config={config}
          fixed
          // A label on the last dive number can reach past the svg's edge
          // ("1000" on a big log) into the card's padding, so it isn't cut.
          className="aspect-auto size-full [&_.recharts-surface]:overflow-visible"
        >
          <ComposedChart
            width={width}
            height={height}
            // Drawn for the eye only, so not a tab stop.
            accessibilityLayer={false}
            data={data}
            margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
          >
            {/* At the labelled values only, not also at the plot's edges. No
              vertical lines, and nothing to place them: unasked, the grid
              measured a tick per dive in the DOM (about 3 s on a big log). */}
            <CartesianGrid
              vertical={false}
              verticalCoordinatesGenerator={() => []}
              horizontalValues={gridlines}
            />
            <XAxis
              dataKey="x"
              type="number"
              domain={[...axis.domain]}
              ticks={ticks}
              tick={(props: XAxisTickContentProps) => (
                <text
                  x={props.x}
                  y={props.y}
                  dy="0.71em"
                  textAnchor="middle"
                  className={tickText}
                >
                  {tickLabel(Number(props.payload.value))}
                </text>
              )}
              tickLine={false}
              axisLine={false}
              interval={0}
            />
            <YAxis
              type="number"
              domain={[low, high]}
              ticks={gridlines}
              tick={(props: YAxisTickContentProps) => (
                <text
                  x={props.x}
                  y={props.y}
                  dy="0.355em"
                  textAnchor="end"
                  className={tickText}
                >
                  {props.payload.value}
                </text>
              )}
              tickLine={false}
              axisLine={false}
              // Every given tick shows, so none is measured to see if it fits.
              interval={0}
              width={24}
              // The hidden line's scale, for a lone dive's dot.
              includeHidden
            />
            {/* Over the line and axes, where a Scatter draws. */}
            <ZIndexLayer zIndex={DefaultZIndexes.scatter}>
              <Dots data={data} width={width} placed={placed} />
            </ZIndexLayer>
            <Line
              dataKey="average"
              // One dive has no line, only its dot. Hidden rather than left
              // out, as the y axis takes its scale from a series.
              hide={trend.length < 2}
              // Curved, as a rolling average stands for a gradual trend.
              // Monotone passes through every average without overshooting,
              // so it never draws a peak or dip the dives don't have.
              type="monotone"
              stroke="var(--color-average)"
              strokeWidth={2}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartContainer>
      )}
      <div
        {...handlers}
        className="absolute inset-0 cursor-crosshair touch-pan-y"
      >
        <Marker cursor={cursor} placed={placed} last={trend.length - 1} />
      </div>
    </div>
  )
})

// Every dive's dot from the axes' scales in one component: a Recharts
// Scatter made a component and a store selector per dot, most of a second
// for each redraw of a big log. A circle each, so overlaps still darken.
function Dots({
  data,
  width,
  placed,
}: {
  data: { x: number; sac: number; clamped: boolean; rate: number }[]
  width: number
  placed: Placed
}) {
  const x = useXAxisScale()
  const y = useYAxisScale()
  const points =
    x && y ? data.map((point) => ({ x: x(point.x)!, y: y(point.sac)! })) : []
  useLayoutEffect(() => placed.set(points))
  if (!x || !y) return null
  return (
    <g>
      {data.map((point, i) => {
        const { x: cx, y: cy } = points[i]!
        return point.clamped ? (
          // Its rate beside it, on the side with room.
          <g key={i}>
            <path
              d={`M${cx - 4} ${cy + 3}L${cx} ${cy - 2}L${cx + 4} ${cy + 3}`}
              fill="none"
              stroke="var(--color-sac)"
              strokeOpacity={0.6}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <text
              x={cx + (cx > width - 40 ? -7 : 7)}
              y={cy}
              dy="0.3em"
              textAnchor={cx > width - 40 ? "end" : "start"}
              className={tickText}
            >
              {rate(point.rate)}
            </text>
          </g>
        ) : (
          // The board's grey 5.5 px dots, faint so the average reads over them.
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={2.75}
            fill="var(--color-sac)"
            fillOpacity={0.4}
          />
        )
      })}
    </g>
  )
}

// The dots' places, which the marker reads, and its call to move again
// once they change.
type Point = { x: number; y: number }
type Placed = ReturnType<typeof newPlaced>
function newPlaced() {
  let points: Point[] = []
  let moved = () => {}
  return {
    points: () => points,
    set(next: Point[]) {
      points = next
      moved()
    },
    watch(move: () => void) {
      moved = move
      return () => void (moved = () => {})
    },
  }
}

const picked = (cursor: Cursor, last: number) =>
  Math.min(cursor.get() ?? last, last)

// A ring on the picked dive's dot and a hairline down to the axis, moved by
// `transform` straight from the cursor, so a scrub renders nothing.
function Marker({
  cursor,
  placed,
  last,
}: {
  cursor: Cursor
  placed: Placed
  last: number
}) {
  const line = useRef<HTMLDivElement>(null)
  const dot = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const place = () => {
      const point = placed.points()[picked(cursor, last)]
      for (const element of [line.current, dot.current])
        element?.classList.toggle("invisible", !point)
      if (!point) return
      line.current!.style.transform = `translateX(${point.x}px)`
      dot.current!.style.transform = `translate(${point.x}px, ${point.y}px)`
    }
    const unwatch = placed.watch(place)
    const stop = cursor.add(place)
    return () => {
      stop()
      unwatch()
    }
  }, [cursor, placed, last])
  return (
    <>
      {/* From the plot's top to the axis, Recharts' 30 px under it. */}
      <div
        ref={line}
        className="invisible absolute top-2 bottom-7.5 left-0 w-px bg-foreground/25"
      />
      <div
        ref={dot}
        className="invisible absolute top-0 left-0 -mt-1.25 -ml-1.25 size-2.5 rounded-full bg-foreground ring-2 ring-card"
      />
    </>
  )
}

// The picked dive's rate and the five-dive average there, small, beside
// the card's caption so it takes no height of its own.
export function SacReadout({
  trend,
  cursor,
}: {
  trend: Statistics["sac"]["trend"]
  cursor: Cursor
}) {
  const last = trend.length - 1
  const index = useSyncExternalStore(cursor.add, () => picked(cursor, last))
  const point = trend[index]!
  return (
    <span
      aria-hidden
      data-slot="readout"
      className="whitespace-nowrap tabular-nums"
    >
      <span className="font-semibold text-foreground">{rate(point.sac)}</span>{" "}
      L/min · avg {rate(point.average)}
    </span>
  )
}
