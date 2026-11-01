import { useId } from "react"
import { cn } from "cn"

import { chartDepthAxis } from "@/chart/layout"

// The Log's 24-point profile (D2) from the surface and back, in the board's
// 60 × 24 box. The scale is the profile chart's depth axis with its 30 m
// floor, unlike the detail's, so a shallow dive looks shallow in the list.
// `stretch` keeps the line weight. The water above the profile is shaded,
// densest at the surface, so the line reads as a dive rather than a stock
// chart without drawing the surface itself (a hairline there was too harsh).
export function Sparkline({
  points: slices,
  maxDepth,
  stretch,
  className,
}: {
  points: readonly number[]
  maxDepth: number
  stretch?: boolean
  className?: string
}) {
  const points = [0, ...slices, 0]
  const scale =
    chartDepthAxis(Math.round(Math.max(maxDepth, ...points) * 1000), {
      zoomed: false,
    }).max / 1000
  const step = 58 / (points.length - 1)
  const line = points
    .map(
      (depth, i) =>
        `${(1 + i * step).toFixed(1)},${(2 + (depth / scale) * 20).toFixed(1)}`
    )
    .join(" ")
  // useId's colons and guillemets aren't safe inside url(#…).
  const water = `water-${useId().replace(/[^\w-]/g, "")}`
  return (
    <svg
      viewBox="0 0 60 24"
      preserveAspectRatio={stretch ? "none" : undefined}
      fill="none"
      role="img"
      aria-label={`Depth profile to ${maxDepth.toFixed(1)} metres`}
      className={cn("block h-5.5 w-14 text-primary", className)}
    >
      <defs>
        <linearGradient
          id={water}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="2"
          x2="0"
          y2="22"
        >
          <stop
            offset="0"
            stopColor="currentColor"
            className="[stop-opacity:0.2] dark:[stop-opacity:0.28]"
          />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.03" />
        </linearGradient>
      </defs>
      <polygon points={line} fill={`url(#${water})`} />
      <polyline
        points={line}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect={stretch ? "non-scaling-stroke" : undefined}
      />
    </svg>
  )
}
