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
import { profileMaxDepth } from "@/dive/figures"
import { cardDay } from "@/format/dates"
import { depth, minutes } from "@/format/figures"
import { cardPlace } from "@/format/place"

// Fixed, so a month group's height is known before it renders (see
// MonthGroup's contain-intrinsic-size).
export const cardHeight = 84

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
      // Below 390px (iPhone SE and mini) the sparkline gives its column to the
      // site and place, which would otherwise lose their ends. The number and figures get fixed
      // widths (four digits; 42.3 m, 188 min), so columns line up down the list.
      // Desktop has room to spare, so the sparkline widens to show the profile
      // and keeps clear of the figures.
      className="grid grid-cols-[minmax(2rem,auto)_minmax(0,1fr)_minmax(4.25rem,auto)] flex-nowrap gap-x-3 py-0 pr-4 pl-3.5 select-none [-webkit-touch-callout:none] min-[390px]:grid-cols-[minmax(2rem,auto)_minmax(0,1fr)_56px_minmax(4.25rem,auto)] md:grid-cols-[minmax(2rem,auto)_minmax(0,1fr)_14rem_minmax(4.25rem,auto)]"
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
      {/* The site name is what tells dives apart, so it wraps to a second
          line rather than losing its end; the place is secondary and
          truncates (the detail shows it whole). */}
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="line-clamp-2 text-[17px] leading-[1.2] font-medium tracking-[-0.015em] [overflow-wrap:anywhere]">
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
      <span className="hidden items-center min-[390px]:flex md:pr-8">
        {dive.sparkline && (
          <Sparkline
            points={dive.sparkline}
            maxDepth={profileMaxDepth(dive, log.fieldMeta.get(dive.id))}
            stretch
            className="w-full md:h-7"
          />
        )}
      </span>
      <span className="flex flex-col items-end gap-1.5 tabular-nums">
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
