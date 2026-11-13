import { cn } from "cn"

import { dives, SrTable, tint } from "./parts"

// StatsHifi's bar charts: the count over each bar, its label under it, and
// the tallest bar in the accent. An empty bar is a hairline with no count.
export function Bars({
  caption,
  bars,
  height,
  colours,
  gap,
  className,
}: {
  caption: string
  bars: { label: string; name: string; count: number }[]
  // Of the tallest bar, in px.
  height: number
  // One per bar; otherwise the accent for the tallest and a tint for the rest.
  colours?: string[]
  // Between bars, in px.
  gap: number
  className?: string
}) {
  const max = Math.max(1, ...bars.map((bar) => bar.count))
  // Past twelve columns the counts would touch, so only the tallest keeps
  // its count, the latest of a tie; the table alternative has every one.
  const crowded = bars.length > 12
  const counted = bars.findLastIndex((bar) => bar.count === max)
  const columns = {
    gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`,
    gap,
  }
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        aria-hidden
        className="grid items-end"
        style={{ ...columns, height: height + 24 }}
      >
        {bars.map((bar, i) => (
          <div
            key={bar.name}
            className="flex h-full flex-col items-center justify-end gap-1"
          >
            <span
              className={cn(
                "text-[11px] font-medium text-muted-foreground tabular-nums",
                (!bar.count || (crowded && i !== counted)) && "invisible"
              )}
            >
              {bar.count}
            </span>
            <span
              className="w-full max-w-24 rounded-t-[4px] rounded-b-[2px]"
              style={{
                height: bar.count ? Math.max(6, (bar.count / max) * height) : 2,
                background: !bar.count
                  ? "var(--border)"
                  : (colours?.[i] ??
                    (bar.count === max ? "var(--primary)" : tint(42))),
              }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden className="grid" style={columns}>
        {bars.map((bar) => (
          <span
            key={bar.name}
            className="text-center text-[11px] text-muted-foreground tabular-nums"
          >
            {bar.label}
          </span>
        ))}
      </div>
      <SrTable
        caption={caption}
        head={["", "Dives"]}
        rows={bars.map((bar) => [bar.name, dives(bar.count)])}
      />
    </div>
  )
}
