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

import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { dayMonth } from "@/format/dates"
import type { Statistics } from "@/stats/figures"

import { monthLetters, rate, SrTable, yearLabels } from "./parts"

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
const yearStart = (year: number) => Date.UTC(year, 0, 1) / 86_400_000

// The SAC rate of each dive and the five-dive average through the year,
// or across every year for all time.
// Plain <text> ticks, as Recharts' own measure each word in the DOM to
// wrap it, and every measure restyles the page.
export function SacTrend({
  trend,
  year,
}: {
  trend: Statistics["sac"]["trend"]
  year: string | undefined
}) {
  const data = trend.map((point) => ({
    x: day(point.dive.startTime),
    sac: point.sac,
    average: point.average,
  }))
  const first = year
    ? Number(year)
    : Number(trend[0]!.dive.startTime.slice(0, 4))
  const last = year ? first : Number(trend.at(-1)!.dive.startTime.slice(0, 4))
  const domain = [yearStart(first), yearStart(last + 1)]
  // A label in the middle of each month or year.
  const ticks = year
    ? Array.from(monthLetters, (_, m) => {
        const start = Date.UTC(first, m, 1) / 86_400_000
        const end = Date.UTC(first, m + 1, 1) / 86_400_000
        return (start + end) / 2
      })
    : Array.from(
        { length: last - first + 1 },
        (_, i) => (yearStart(first + i) + yearStart(first + i + 1)) / 2
      )
  const years = yearLabels(ticks.map((_, i) => String(first + i)))
  const tickLabel = (value: number) => {
    const i = ticks.indexOf(value)
    return (year ? monthLetters[i] : years[i]) ?? ""
  }
  const rates = trend.map((point) => point.sac)
  // Never below 0, which a rate under 2 L/min would otherwise take it to.
  const low = Math.max(0, Math.floor(Math.min(...rates) / 2) * 2 - 1)
  const high = Math.ceil(Math.max(...rates) / 2) * 2 + 1
  // Deduplicated, as rates all on one even number put the three together.
  const gridlines = [
    ...new Set([high - 1, Math.round((high + low) / 2), low + 1]),
  ]

  return (
    <>
      <ChartContainer
        aria-hidden
        config={config}
        // A long press neither selects the labels nor opens a menu.
        className="aspect-auto h-42 w-full select-none [-webkit-touch-callout:none]"
      >
        <ComposedChart
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
            domain={domain}
            ticks={ticks}
            tick={(props: XAxisTickContentProps) => (
              <text x={props.x} y={props.y} dy="0.71em" textAnchor="middle">
                {tickLabel(Number(props.payload.value))}
              </text>
            )}
            tickLine={false}
            axisLine={false}
            interval={0}
            allowDataOverflow
          />
          <YAxis
            type="number"
            domain={[low, high]}
            ticks={gridlines}
            tick={(props: YAxisTickContentProps) => (
              <text x={props.x} y={props.y} dy="0.355em" textAnchor="end">
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
            shape={(props: { cx?: number; cy?: number }) => (
              <circle
                cx={props.cx}
                cy={props.cy}
                r={2.75}
                fill="var(--color-sac)"
                fillOpacity={0.4}
              />
            )}
          />
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
        </ComposedChart>
      </ChartContainer>
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
