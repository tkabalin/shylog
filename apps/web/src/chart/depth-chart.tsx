import { memo, useId } from "react"
import { timeLabel, type SpeedBand } from "@shylog/core"
import {
  Area,
  ComposedChart,
  DefaultZIndexes,
  ReferenceArea,
  ReferenceLine,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
  XAxis,
  YAxis,
  ZIndexLayer,
  type XAxisTickContentProps,
} from "recharts"

import { cn } from "cn"

import { ChartContainer, type ChartConfig } from "@/components/ui/chart"

import { halo } from "./format"
import { chartHeight, plotHeight, plotLeft, plotTop } from "./layout"
import type { ProfileModel } from "./model"

const config = {
  depth: { label: "Depth", color: "var(--primary)" },
} satisfies ChartConfig

const bandColour = (band: SpeedBand) => `var(--speed-${band})`

// Tabler's alert-triangle, drawn 14 px wide over each event's band.
const warnPath =
  "M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z"
const iconSize = 14

let canvas: CanvasRenderingContext2D | null | undefined
// A time label's width from the font itself, to keep it inside the chart.
function textWidth(text: string) {
  canvas ??= document.createElement("canvas").getContext("2d")
  if (!canvas) return text.length * 6
  canvas.font = "10px Geist Variable, sans-serif"
  return canvas.measureText(text).width
}

// The depth line, coloured by vertical speed with no legend, over a soft
// fill to the surface; grid, ticks, event bands, the MOD line, labelled
// depths. Everything is plotted against elapsed time. The crosshair is
// drawn over it separately (crosshair.tsx), so scrubbing doesn't redraw it.
export const DepthChart = memo(function DepthChart({
  model,
  width,
}: {
  model: ProfileModel
  width: number
}) {
  const gradient = `speed-${useId().replace(/:/g, "")}`
  const { points, time, depth } = model
  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full text-[10px]"
      style={{ height: chartHeight }}
      initialDimension={{ width, height: chartHeight }}
    >
      <ComposedChart
        data={points}
        margin={{ top: plotTop, right: 0, bottom: 0, left: plotLeft }}
        // The table under the chart is its screen-reader alternative.
        accessibilityLayer={false}
      >
        <defs>
          <SpeedGradient id={gradient} model={model} />
        </defs>
        <XAxis
          type="number"
          dataKey="time"
          domain={[0, time.max]}
          ticks={time.values}
          interval={0}
          height={chartHeight - plotTop - plotHeight}
          axisLine={false}
          tickLine={false}
          allowDataOverflow
          tick={(props: XAxisTickContentProps) => (
            <TimeTick
              x={Number(props.x)}
              y={Number(props.y)}
              value={Number(props.payload.value)}
              model={model}
              width={width}
            />
          )}
        />
        <YAxis hide type="number" domain={[0, depth.max]} reversed />
        {depth.values.map((value) => (
          <ReferenceLine
            key={value}
            y={value}
            stroke="var(--border)"
            strokeWidth={1}
            zIndex={DefaultZIndexes.grid}
          />
        ))}
        {model.events.map((event) => (
          <ReferenceArea
            key={`${event.type} ${event.start}`}
            x1={event.start}
            x2={model.eventEnd(event)}
            fill="var(--warn-band)"
            fillOpacity={1}
            ifOverflow="hidden"
            // Under the profile's fill and line, over the grid.
            zIndex={DefaultZIndexes.barBackground}
          />
        ))}
        {model.mod != null && (
          <ReferenceLine
            y={model.mod * 1000}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 3"
          />
        )}
        <Area
          dataKey="depth"
          type="linear"
          stroke={`url(#${gradient})`}
          strokeWidth={2.25}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="var(--color-depth)"
          fillOpacity={0.09}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
        {/* Over the line, so labels and the crosshair read on top. */}
        <ZIndexLayer zIndex={DefaultZIndexes.label}>
          <Annotations model={model} />
        </ZIndexLayer>
      </ComposedChart>
    </ChartContainer>
  )
})

// Hard colour stops along the line: each segment takes the band of the
// point it ends on, as Subsurface colours it. The gradient spans the
// line's own box, from the first point's time to the last's.
function SpeedGradient({ id, model }: { id: string; model: ProfileModel }) {
  const { points, speeds } = model
  const span = points.at(-1)!.time - points[0].time || 1
  const stops: { offset: number; band: SpeedBand }[] = []
  for (let i = 1; i < points.length; i++) {
    const band = speeds[i].band
    const from = (points[i - 1].time - points[0].time) / span
    const to = (points[i].time - points[0].time) / span
    if (stops.at(-1)?.band === band) stops[stops.length - 1].offset = to
    else stops.push({ offset: from, band }, { offset: to, band })
  }
  return (
    <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
      {stops.map((stop, i) => (
        <stop
          key={i}
          offset={stop.offset}
          style={{ stopColor: bandColour(stop.band) }}
        />
      ))}
    </linearGradient>
  )
}

// Whole minutes under each tick, "min" after the last; a label near an
// edge is anchored to it so it isn't cut off.
function TimeTick({
  x,
  y,
  value,
  model,
  width,
}: {
  x: number
  y: number
  value: number
  model: ProfileModel
  width: number
}) {
  const last = value === model.time.values.at(-1)
  const text = `${timeLabel(value, model.time)}${last ? " min" : ""}`
  const half = textWidth(text) / 2
  const anchor = x - half < 0 ? "start" : x + half > width ? "end" : "middle"
  return (
    <text
      x={x}
      y={y + 6}
      dy="0.71em"
      textAnchor={anchor}
      className="fill-muted-foreground tabular-nums"
    >
      {text}
    </text>
  )
}

function Annotations({ model }: { model: ProfileModel }) {
  const x = useXAxisScale()
  const y = useYAxisScale()
  const plot = usePlotArea()
  if (!x || !y || !plot) return null
  const { depth } = model
  const top = plot.y
  const bottom = plot.y + plot.height

  const left = plot.x
  const right = plot.x + plot.width
  return (
    <g className="tabular-nums" aria-hidden>
      {/* In the gutter, centred on their gridlines; none at the surface. */}
      {depth.values.slice(1).map((value) => (
        <text
          key={value}
          x={left - 4}
          y={y(value)}
          dy="0.32em"
          textAnchor="end"
          className="fill-muted-foreground"
        >
          {Math.round(value / 1000)} m
        </text>
      ))}
      {model.mod != null && (
        <text
          x={right - 2}
          y={y(model.mod * 1000)! - 4}
          textAnchor="end"
          className={cn(halo, "fill-muted-foreground")}
        >
          MOD {model.mod.toFixed(1)} m
        </text>
      )}
      {model.depthLabels.map((label) => {
        const px = x(label.time)!
        const ly = y(label.depth)!
        // Peaks below their point and valleys above, clear of the
        // crosshair's circle, which rests on the deepest peak; a peak too
        // near the axis's end goes above instead, clear of the time labels.
        // Near either edge a label sits beside its point, off the tick labels.
        const below = label.kind === "peak" && ly + 16 <= bottom - 2
        const side =
          px < left + 30 ? "start" : px > right - 30 ? "end" : "middle"
        return (
          <text
            key={`${label.kind} ${label.time}`}
            x={side === "start" ? px + 8 : side === "end" ? px - 8 : px}
            y={side !== "middle" ? ly + 3.5 : below ? ly + 16 : ly - 8}
            textAnchor={side}
            className={cn(halo, "fill-foreground font-medium")}
          >
            {(label.depth / 1000).toFixed(1)}
          </text>
        )
      })}
      {/* An icon over each event's band; the alarms list and the readout
          name them. */}
      {model.events.map((event) => {
        // Kept whole inside the plot when the band is at its edge.
        const centre = Math.min(
          Math.max(x((event.start + model.eventEnd(event)) / 2)!, left + 7),
          right - 7
        )
        return (
          <g
            key={`${event.type} ${event.start}`}
            // Clear of the plot's top, where the line starts at the surface.
            transform={`translate(${centre - iconSize / 2} ${top - iconSize - 3}) scale(${iconSize / 24})`}
            className="text-warn"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={warnPath} className="fill-card" />
            <path d="M12 9v4 M12 16h.01" />
          </g>
        )
      })}
    </g>
  )
}
