import type { ComponentType } from "react"
import { cn } from "cn"

import { dives, percent, SrTable } from "./parts"

export interface Tile {
  label: string
  count: number
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>
}

// StatsHifi's row of tiles: each value's share, the most common one's icon
// in the accent, with a table alternative as the other charts have.
export function Tiles({ label, tiles }: { label: string; tiles: Tile[] }) {
  const total = tiles.reduce((sum, tile) => sum + tile.count, 0)
  const max = Math.max(...tiles.map((tile) => tile.count))
  return (
    <>
      <ul
        aria-hidden
        className="grid auto-cols-fr grid-flow-col divide-x [&~&]:border-t"
      >
        {tiles.map(({ label: name, count, icon: Icon }) => (
          <li
            key={name}
            className="flex flex-col items-center gap-0.75 px-1 pt-3.5 pb-3 text-center"
          >
            <Icon
              className={cn(
                "size-5.5 stroke-[1.75]",
                count && count === max
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            />
            <span className="text-lg leading-6 font-semibold tracking-[-0.02em] tabular-nums">
              {percent(count, total)}
            </span>
            <span className="text-xs text-muted-foreground">{name}</span>
          </li>
        ))}
      </ul>
      <SrTable
        caption={label}
        head={["", "Dives", "Share"]}
        rows={tiles.map((tile) => [
          tile.label,
          dives(tile.count),
          percent(tile.count, total),
        ])}
      />
    </>
  )
}
