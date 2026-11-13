import { cn } from "cn"

import { dives, percent, SrTable } from "./parts"

// A colour as a CSS value (the accent's tints), or a Tailwind class for a
// palette colour, which Tailwind only emits for a class it finds.
export interface Segment {
  label: string
  count: number
  colour?: string
  className?: string
}

// Hatched, so dives that didn't log a field never read as a level.
const notLogged =
  "repeating-linear-gradient(135deg, color-mix(in oklab, var(--muted-foreground) 45%, transparent) 0 2px, transparent 2px 5px)"

// StatsHifi's proportion strip with its key, each share of every dive in
// the year, dives that didn't log it included.
export function Strip({
  caption,
  segments,
  unlogged = 0,
  className,
}: {
  caption: string
  segments: Segment[]
  unlogged?: number
  className?: string
}) {
  const shown: Segment[] = [
    ...segments.filter((segment) => segment.count),
    ...(unlogged
      ? [{ label: "Not logged", count: unlogged, colour: notLogged }]
      : []),
  ]
  const total = shown.reduce((sum, segment) => sum + segment.count, 0)
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div aria-hidden className="flex h-3 gap-0.5">
        {shown.map((segment, i) => (
          <span
            key={segment.label}
            className={cn(
              "min-w-[3px] rounded-[1px]",
              i === 0 && "rounded-l-[4px]",
              i === shown.length - 1 && "rounded-r-[4px]",
              segment.className
            )}
            style={{
              flex: `${segment.count} 1 0px`,
              background: segment.colour,
            }}
          />
        ))}
      </div>
      <div
        aria-hidden
        className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
      >
        {shown.map((segment) => (
          <span
            key={segment.label}
            className="inline-flex items-center gap-1.25 whitespace-nowrap"
          >
            <span
              className={cn("size-2 rounded-[2px]", segment.className)}
              style={{ background: segment.colour }}
            />
            {segment.label}
            <span className="text-foreground tabular-nums">
              {percent(segment.count, total)}
            </span>
          </span>
        ))}
      </div>
      <SrTable
        caption={caption}
        head={["", "Dives", "Share"]}
        rows={shown.map((segment) => [
          segment.label,
          dives(segment.count),
          percent(segment.count, total),
        ])}
        // A strip only shows once its row is opened, after the screen.
        now
      />
    </div>
  )
}
