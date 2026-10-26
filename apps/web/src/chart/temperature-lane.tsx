import { memo } from "react"
import {
  DefaultZIndexes,
  Line,
  LineChart,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
  XAxis,
  YAxis,
  ZIndexLayer,
} from "recharts"

import { cn } from "cn"

import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { temperature } from "@/format/figures"

import { halo } from "./format"
import { laneBottom, laneHeight, laneTop, plotLeft } from "./layout"
import type { ProfileModel } from "./model"

const config = {
  temperature: {
    label: "Water temperature",
    color: "var(--muted-foreground)",
  },
} satisfies ChartConfig

// Water temperature in its own lane under the depth chart, on the same time
// axis. The D4i records it only when it changes, so the line steps. The
// crosshair is drawn over it separately (crosshair.tsx).
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
        {/* Over the line, so the labels read on top. */}
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
  const x = useXAxisScale()
  const y = useYAxisScale()
  const plot = usePlotArea()
  if (!x || !y || !plot) return null
  return (
    <g aria-hidden className="tabular-nums">
      <line
        x1={plotLeft}
        x2={width}
        y1={laneHeight - 0.5}
        y2={laneHeight - 0.5}
        className="stroke-border"
      />
      {/* Above the line and starting at its point, as Subsurface aligns
          them, turned back near the right edge to stay in the lane. */}
      {model.temperatureLabels.map((label) => {
        const lx = x(label.time)!
        return (
          <text
            key={label.time}
            x={lx}
            y={y(label.temperature)! - 4}
            textAnchor={lx > width - 24 ? "end" : "start"}
            className={cn(halo, "fill-muted-foreground")}
          >
            {temperature(label.temperature)}°
          </text>
        )
      })}
    </g>
  )
}
