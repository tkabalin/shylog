import { useRef } from "react"
import {
  CartesianGrid,
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  type XAxisTickContentProps,
  type YAxisTickContentProps,
} from "recharts"

import { useSize } from "@/chart/size"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { dayMonth } from "@/format/dates"
import type { Dive } from "@/data/db"
import type { Statistics } from "@/stats/figures"
import { numberAxis, rateScale, timeAxis } from "@/stats/trend"

import { rate, SrTable } from "./parts"

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
// wrap it, and every measure restyles the page.
export function SacTrend({
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
    <>
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
            className="aspect-auto size-full"
          >
            <ComposedChart
              width={width}
              height={height}
              // Hidden from screen readers, which read the table, so not a tab stop.
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
              />
              <Scatter
                dataKey="sac"
                isAnimationActive={false}
                // The board's grey 5.5 px dots, faint so the average reads over them.
                shape={(props: {
                  cx?: number
                  cy?: number
                  payload?: { clamped: boolean; rate: number }
                }) =>
                  props.payload?.clamped ? (
                    // Its rate beside it, on the side with room.
                    <g>
                      <path
                        d={`M${props.cx! - 4} ${props.cy! + 3}L${props.cx} ${props.cy! - 2}L${props.cx! + 4} ${props.cy! + 3}`}
                        fill="none"
                        stroke="var(--color-sac)"
                        strokeOpacity={0.6}
                        strokeWidth={1.75}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <text
                        x={props.cx! + (props.cx! > width - 40 ? -7 : 7)}
                        y={props.cy}
                        dy="0.3em"
                        textAnchor={props.cx! > width - 40 ? "end" : "start"}
                        className={tickText}
                      >
                        {rate(props.payload.rate)}
                      </text>
                    </g>
                  ) : (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={2.75}
                      fill="var(--color-sac)"
                      fillOpacity={0.4}
                    />
                  )
                }
              />
              {/* One dive has no line, only its dot. */}
              {trend.length > 1 && (
                <Line
                  dataKey="average"
                  // Straight between dives, as an average of discrete dives is.
                  type="linear"
                  stroke="var(--color-average)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ChartContainer>
        )}
      </div>
      <SrTable
        caption="SAC rate per dive, in litres per minute"
        head={["Dive", "SAC rate", "Average of last 5"]}
        rows={trend.map((point) => [
          `${dayMonth(point.dive.startTime)} ${point.dive.startTime.slice(0, 4)}`,
          `${rate(point.sac)} L/min`,
          `${rate(point.average)} L/min`,
        ])}
      />
    </>
  )
}
