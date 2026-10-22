import { cn } from "cn"

// The Log's 24-point profile (D2) from the surface and back, in the board's
// 60 × 24 box. The scale is the profile chart's (deepest + 3 m, at least
// 30 m), so a shallow dive looks shallow. `stretch` keeps the line weight.
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
  const scale = Math.max(30, Math.max(maxDepth, ...points) + 3)
  const step = 58 / (points.length - 1)
  const line = points
    .map(
      (depth, i) =>
        `${(1 + i * step).toFixed(1)},${(2 + (depth / scale) * 20).toFixed(1)}`
    )
    .join(" ")
  return (
    <svg
      viewBox="0 0 60 24"
      preserveAspectRatio={stretch ? "none" : undefined}
      fill="none"
      role="img"
      aria-label={`Depth profile to ${maxDepth.toFixed(1)} metres`}
      className={cn("block h-5.5 w-14 text-primary", className)}
    >
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
