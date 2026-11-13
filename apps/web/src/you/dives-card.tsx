import { useState, type ReactNode } from "react"
import type { EntityKind } from "@shylog/core"
import {
  IconArrowBarToDown,
  IconCalendar,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconClockPlay,
  IconListCheck,
} from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { cn } from "cn"

import { countText } from "@/components/pickers/match"
import { Card } from "@/components/ui/card"
import type { Dive } from "@/data/db"
import type { LogView } from "@/data/log"
import { Reveal } from "@/dive/form/rows"
import { clockTime, longDate } from "@/format/dates"
import { depth, minutes } from "@/format/figures"

// An entity's Dives card, saved or new: three dives, then the rest 50 at a
// time, so a busy site never renders hundreds of rows at once, with any
// row the screen adds last.
export function DivesCard({
  dives,
  kind,
  log,
  parent,
  children,
}: {
  dives: Dive[]
  kind: EntityKind
  log: LogView
  parent?: string
  children?: ReactNode
}) {
  const [shown, setShown] = useState(3)
  return (
    <Card className="gap-0 divide-y py-0">
      {dives.slice(0, 3).map((dive) => (
        <DiveRow
          key={dive.id}
          dive={dive}
          kind={kind}
          log={log}
          parent={parent}
        />
      ))}
      {/* The rest ease open rather than pushing what's below down at once. */}
      {/* One reveal per batch, so each "more" eases open too. */}
      {Array.from(
        { length: Math.ceil((shown - 3) / 50) },
        (_, batch) => 3 + batch * 50
      ).map((start) => (
        <Reveal key={start} className="divide-y">
          {dives.slice(start, start + 50).map((dive) => (
            <DiveRow
              key={dive.id}
              dive={dive}
              kind={kind}
              log={log}
              parent={parent}
            />
          ))}
        </Reveal>
      ))}
      {/* Folds shut as the last batch opens, rather than leaving at once
          and dropping the page under the finger. */}
      {dives.length > 3 && (
        <div
          inert={dives.length <= shown}
          className={cn(
            "grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-out motion-reduce:transition-[opacity,visibility]",
            dives.length > shown
              ? "visible grid-rows-[1fr] opacity-100"
              : "invisible grid-rows-[0fr] opacity-0"
          )}
        >
          <button
            type="button"
            onClick={() => setShown((was) => was + 50)}
            className="flex min-h-0 items-center gap-1.5 overflow-hidden px-4 text-left text-[15px] font-medium text-primary transition-colors duration-150 select-none hover:bg-muted/60 data-press:bg-muted data-press:duration-0"
          >
            {/* "All" only when one tap shows them all. */}
            <span className="flex min-h-12 items-center gap-1.5">
              {dives.length - shown <= 50
                ? `All ${countText(dives.length)} dives`
                : "50 more"}
              <IconChevronDown aria-hidden className="size-4" />
            </span>
          </button>
        </div>
      )}
      {children}
    </Card>
  )
}

// The last row of the Dives card on a trip, dive centre or person, new or
// saved, opening the dive picker.
export function ChooseDivesRow({
  onClick,
  disabled,
}: {
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-12 items-center gap-2 px-4 text-left text-[15px] font-medium text-primary transition-colors duration-150 select-none enabled:hover:bg-muted/60 disabled:text-muted-foreground/60 enabled:data-press:bg-muted enabled:data-press:duration-0"
    >
      <IconListCheck aria-hidden className="size-[1.15em]" />
      Choose dives
    </button>
  )
}

// A site's dives are told apart by date; anything else's by site.
export function DiveRow({
  dive,
  kind,
  log,
  parent,
}: {
  dive: Dive
  kind: EntityKind
  log: LogView
  // The entity's name, which the dive's Back link says. Without one the row
  // doesn't open the dive, as on a new one, which leaving would lose.
  parent?: string
}) {
  const site = log.sites.get(dive.siteId)?.name
  const title = kind === "site" ? longDate(dive.startTime) : site
  const parts =
    kind === "site"
      ? [
          { icon: IconClockPlay, text: clockTime(dive.startTime) },
          { icon: IconClock, text: `${minutes(dive.duration)} min` },
        ]
      : [
          { icon: IconCalendar, text: longDate(dive.startTime) },
          { icon: IconClock, text: `${minutes(dive.duration)} min` },
        ]
  const content = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium">{title}</span>
        {/* The date gives way before the duration does. */}
        <span className="flex min-w-0 items-center gap-3 overflow-hidden text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
          {parts.map(({ icon: Icon, text }) => (
            <span
              key={text}
              className="inline-flex min-w-0 items-center gap-1 last:shrink-0"
            >
              <Icon aria-hidden className="size-[1.15em] shrink-0" />
              <span className="truncate">{text}</span>
            </span>
          ))}
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium tabular-nums">
        <IconArrowBarToDown
          aria-hidden
          className="size-3.5 text-muted-foreground"
        />
        {depth(dive.maxDepth)} m
      </span>
    </>
  )
  if (parent === undefined)
    return (
      <div className="flex min-h-14 items-center gap-3 py-2.5 pr-4 pl-4">
        {content}
      </div>
    )
  return (
    <Link
      to="/dive/$diveId"
      params={{ diveId: dive.id }}
      // An entity opened from Statistics passes that on, so Stats stays
      // the current tab on its dives too.
      state={(prev) => ({
        pushed: true,
        parent,
        ...(prev.fromStats && { fromStats: true as const }),
      })}
      className="flex min-h-14 items-center gap-3 py-2.5 pr-3 pl-4 transition-colors duration-150 select-none [-webkit-touch-callout:none] hover:bg-muted/60 data-press:bg-muted data-press:duration-0"
    >
      {content}
      <IconChevronRight
        aria-hidden
        className="size-4.5 shrink-0 text-muted-foreground/60"
      />
    </Link>
  )
}
