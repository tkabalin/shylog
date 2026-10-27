import { cn } from "cn"

import { laneBottom, laneHeight, laneTop, plotTop } from "./layout"
import type { ProfileModel } from "./model"

// The crosshair, drawn in its own layers over the charts' scales so a move
// redraws two small SVGs, not the charts. The line goes under the chart
// (its wrapper is `isolate`), where label halos mask it; the dot goes over.
export function Crosshair({
  model,
  index,
  width,
  lane,
  layer,
}: {
  model: ProfileModel
  index: number
  width: number
  lane?: boolean
  layer: "line" | "dot"
}) {
  const point = model.points[index]
  const x = model.left + (point.time / model.time.max) * (width - model.left)
  const height = lane ? laneHeight : model.chartHeight
  let y: number | null
  if (lane) {
    const range = model.temperature!
    const span = laneHeight - laneTop - laneBottom
    y =
      point.temperature == null
        ? null
        : laneTop +
          ((range.max - point.temperature) / (range.max - range.min)) * span
  } else {
    y = plotTop + (point.depth / model.depth.max) * model.plotHeight
  }
  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      className={cn(
        "pointer-events-none absolute inset-0 overflow-visible",
        layer === "line" && "-z-10"
      )}
    >
      {layer === "line" ? (
        <line
          x1={x}
          x2={x}
          y1={lane ? 0 : plotTop}
          y2={lane ? height : plotTop + model.plotHeight}
          className="stroke-foreground"
          strokeOpacity={0.5}
        />
      ) : (
        y != null && (
          <circle
            cx={x}
            cy={y}
            r={lane ? 3.5 : 5}
            className={cn(
              "fill-card",
              lane ? "stroke-muted-foreground" : "stroke-primary"
            )}
            strokeWidth={lane ? 2 : 2.5}
          />
        )
      )}
    </svg>
  )
}
