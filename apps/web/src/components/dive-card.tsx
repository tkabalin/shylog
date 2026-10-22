import {
  IconArrowBarToDown,
  IconEyeOff,
  IconHourglass,
} from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"

import { Sparkline } from "@/components/sparkline"
import { Item } from "@/components/ui/item"
import type { Dive } from "@/data/db"
import type { LogView } from "@/data/log"
import { cardDay } from "@/format/dates"
import { depth, minutes } from "@/format/figures"
import { cardPlace } from "@/format/place"

// Fixed, so a month group's height is known before it renders (see
// MonthGroup's contain-intrinsic-size).
export const cardHeight = 72

// LogHifi2's card: number, site, "Sat 10 · place", sparkline, depth and time.
export function DiveCard({ dive, log }: { dive: Dive; log: LogView }) {
  const site = log.sites.get(dive.siteId)
  const region = site?.regionId ? log.regions.get(site.regionId) : undefined
  return (
    <Item
      variant="card"
      render={
        <Link
          to="/dive/$diveId"
          params={{ diveId: dive.id }}
          state={{ fromLog: true }}
        />
      }
      style={{ height: cardHeight }}
      // Below 360px the sparkline gives its column to the site name, which would
      // otherwise shrink to a few letters.
      className="grid grid-cols-[minmax(28px,auto)_minmax(0,1fr)_auto] flex-nowrap gap-x-3 py-0 pr-4 pl-3.5 select-none [-webkit-touch-callout:none] min-[360px]:grid-cols-[minmax(28px,auto)_minmax(0,1fr)_56px_auto]"
    >
      <span className="text-[13px] font-medium text-muted-foreground tabular-nums">
        {dive.ignored ? (
          <>
            <IconEyeOff aria-hidden className="size-4" />
            <span className="sr-only">Ignored</span>
          </>
        ) : (
          dive.number
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-base font-medium tracking-[-0.015em]">
          {site?.name}
        </span>
        <span className="flex min-w-0 text-[13px] whitespace-nowrap text-muted-foreground">
          <span className="flex-none tabular-nums">
            {cardDay(dive.startTime)}
          </span>
          <span aria-hidden className="flex-none px-1.25">
            ·
          </span>
          <span className="min-w-0 truncate">{cardPlace(site, region)}</span>
        </span>
      </span>
      <span className="hidden items-center min-[360px]:flex">
        {dive.sparkline && (
          <Sparkline points={dive.sparkline} maxDepth={dive.maxDepth} />
        )}
      </span>
      <span className="flex flex-col items-end gap-0.5 tabular-nums">
        <span className="inline-flex items-center gap-1 text-[15px] font-medium">
          <IconArrowBarToDown
            role="img"
            aria-label="Max depth"
            className="size-3.5 text-muted-foreground"
          />
          {depth(dive.maxDepth)} m
        </span>
        <span className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
          <IconHourglass
            role="img"
            aria-label="Duration"
            className="size-3.25"
          />
          {minutes(dive.duration)} min
        </span>
      </span>
    </Item>
  )
}
