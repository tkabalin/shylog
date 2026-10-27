import { memo } from "react"
import {
  DefaultZIndexes,
  Line,
  LineChart,
  useYAxisScale,
  XAxis,
  YAxis,
  ZIndexLayer,
} from "recharts"

import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { temperature } from "@/format/figures"

import {
  labelHeight,
  laneBottom,
  laneHeight,
  laneTop,
  plotLeft,
} from "./layout"
import type { ProfileModel } from "./model"

const config = {
  temperature: {
    label: "Water temperature",
    color: "var(--muted-foreground)",
  },
} satisfies ChartConfig

// Water temperature in its own lane under the depth chart, on the same time
// axis. The D4i records it only when it changes, so the line steps. Only
// the lowest and highest are labelled; the crosshair (crosshair.tsx) reads
// the rest.
export const TemperatureLane = memo(function TemperatureLane({
  model,
  width,
}: {
  model: ProfileModel
  width: number
}) {
  const range = model.temperature!
  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full text-[10px]"
      style={{ height: laneHeight }}
      initialDimension={{ width, height: laneHeight }}
    >
      <LineChart
        data={model.points}
        margin={{ top: laneTop, right: 0, bottom: laneBottom, left: plotLeft }}
        // The table under the chart is its screen-reader alternative.
        accessibilityLayer={false}
      >
        <XAxis
          hide
          type="number"
          dataKey="time"
          domain={[0, model.time.max]}
          allowDataOverflow
        />
        <YAxis hide type="number" domain={[range.min, range.max]} />
        <Line
          dataKey="temperature"
          type="stepAfter"
          stroke="var(--color-temperature)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          dot={false}
          activeDot={false}
          connectNulls
          isAnimationActive={false}
        />
        <ZIndexLayer zIndex={DefaultZIndexes.label}>
          <LaneAnnotations model={model} width={width} />
        </ZIndexLayer>
      </LineChart>
    </ChartContainer>
  )
})

function LaneAnnotations({
  model,
  width,
}: {
  model: ProfileModel
  width: number
}) {
  const y = useYAxisScale()
  if (!y) return null
  const { min, max } = model.water!
  const low = y(min)!
  // The axis is at least 2 °C tall, so when the water barely changed the
  // highest is pushed up off the lowest.
  const labels =
    temperature(max) === temperature(min)
      ? [{ value: min, at: low }]
      : [
          { value: min, at: low },
          { value: max, at: Math.min(y(max)!, low - labelHeight) },
        ]
  return (
    <g aria-hidden className="tabular-nums">
      <line
        x1={plotLeft}
        x2={width}
        y1={laneHeight - 0.5}
        y2={laneHeight - 0.5}
        className="stroke-border"
      />
      {/* In the gutter, like the depth labels. */}
      {labels.map(({ value, at }) => (
        <text
          key={value}
          x={plotLeft - 4}
          y={at}
          dy="0.32em"
          textAnchor="end"
          className="fill-muted-foreground"
        >
          {temperature(value)}°
        </text>
      ))}
    </g>
  )
}
