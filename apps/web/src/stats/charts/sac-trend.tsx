import { memo, useRef } from "react"
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
}: {
  trend: Statistics["sac"]["trend"]
  year: string | undefined
  // Along the dive numbers rather than the calendar, so a busy week and a
  // quiet year take the same room per dive.
  byNumber: boolean
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

  return (
    <div
      ref={box}
      aria-hidden
      // A long press neither selects the labels nor opens a menu.
      className="h-42 w-full select-none [-webkit-touch-callout:none]"
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
              <Dots data={data} width={width} />
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
    </div>
  )
})

// Every dive's dot from the axes' scales in one component: a Recharts
// Scatter made a component and a store selector per dot, most of a second
// for each redraw of a big log. A circle each, so overlaps still darken.
function Dots({
  data,
  width,
}: {
  data: { x: number; sac: number; clamped: boolean; rate: number }[]
  width: number
}) {
  const x = useXAxisScale()
  const y = useYAxisScale()
  if (!x || !y) return null
  return (
    <g>
      {data.map((point, i) => {
        const cx = x(point.x)!
        const cy = y(point.sac)!
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
