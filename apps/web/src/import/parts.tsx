import type { ReactNode } from "react"
import type { ComputerDive, ImportSummary } from "@shylog/core"
import {
  IconArrowBarToDown,
  IconCheck,
  IconClock,
  IconFilePlus,
  IconPlayerSkipForward,
  IconPlugConnected,
  IconSwimming,
} from "@tabler/icons-react"
import { cn } from "cn"

import { Card } from "@/components/ui/card"
import type { Dive } from "@/data/db"
import type { Icon } from "@/dive/form/rows"
import { cardDay, clockTime, months } from "@/format/dates"
import { depth, minutes } from "@/format/figures"

// A computer dive on helium or under 20.9 % oxygen, which v1 can't hold.
export const unsupportedGas = "Its gas isn’t supported, so it’s stored as air"

// The boards' 48 px buttons on a phone; shadcn's own size with a mouse.
export const bigButton =
  "h-12 rounded-[14px] text-base font-semibold desk:h-9 desk:rounded-lg desk:text-sm"

// A section heading over its card, as You's are.
export function ImportSection({
  title,
  aside,
  children,
}: {
  title: ReactNode
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col">
      {/* The aside beside the heading, not in it, so a control there isn't
          read as part of the heading's name. */}
      <div className="mb-2 flex items-center gap-2 px-1 text-[13px] font-semibold text-muted-foreground tabular-nums">
        <h2 className="flex-1">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function ListCard({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={cn("gap-0 divide-y py-0", className)}>{children}</Card>
  )
}

// "Sat 25 Jul": a dive's day as the review lists it, with the year when
// it isn't this one, as an export can go back years.
export const shortDay = (startTime: string, now = new Date()) =>
  `${cardDay(startTime)} ${months[Number(startTime.slice(5, 7)) - 1]}${
    Number(startTime.slice(0, 4)) === now.getFullYear()
      ? ""
      : ` ${startTime.slice(0, 4)}`
  }`

// "Sat 25 Jul · 09:14".
export const dayAndTime = (startTime: string) =>
  `${shortDay(startTime)} · ${clockTime(startTime)}`

// A dive's depth and duration, with the Log card's icons.
export function Figures({
  dive,
}: {
  dive: Pick<ComputerDive | Dive, "maxDepth" | "duration">
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap">
      <span className="inline-flex shrink-0 items-center gap-1">
        <IconArrowBarToDown aria-hidden className="size-[1.15em] shrink-0" />
        {depth(dive.maxDepth)} m
      </span>
      <span className="inline-flex shrink-0 items-center gap-1">
        <IconClock aria-hidden className="size-[1.15em] shrink-0" />
        {minutes(dive.duration)} min
      </span>
    </span>
  )
}

// A left-out dive's length, to the second: freedives last seconds.
export const shortLength = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

// A round check before a row, as the dive picker's, for a list that picks
// several things.
export function RoundCheck({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-5.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-muted-foreground/70"
      )}
    >
      <IconCheck
        className={cn(
          "size-3.5 stroke-3 transition-opacity duration-150",
          !on && "opacity-0"
        )}
      />
    </span>
  )
}

// A radio before a row, for a list that picks one thing before a confirm.
export function Radio({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150",
        on ? "border-primary" : "border-muted-foreground/60"
      )}
    >
      <span
        className={cn(
          "size-2.5 rounded-full bg-primary transition-opacity duration-150",
          !on && "opacity-0"
        )}
      />
    </span>
  )
}

function SummaryRow({
  icon: RowIcon,
  label,
  value,
  muted,
  tall,
}: {
  icon: Icon
  label: string
  value: number
  muted?: boolean
  tall?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2 text-[15px]",
        tall ? "min-h-12" : "min-h-11"
      )}
    >
      <RowIcon
        aria-hidden
        className={cn(
          "size-4.5 shrink-0 stroke-[1.9]",
          muted ? "text-muted-foreground" : "text-primary"
        )}
      />
      <dt className={cn("flex-1", muted && "text-muted-foreground")}>
        {label}
      </dt>
      <dd
        className={cn(
          "m-0 font-medium tabular-nums",
          muted && "text-muted-foreground"
        )}
      >
        {value}
      </dd>
    </div>
  )
}

// What an import did, as ImportHifi's Last import and ImportDoneHifi list
// it; included left-out dives only when there were any.
export function SummaryRows({
  summary,
  tall,
  className,
}: {
  summary: Omit<ImportSummary, "differing">
  // Done's rows are 48 px, Last import's 44, as the boards draw them.
  tall?: boolean
  className?: string
}) {
  return (
    <dl className={cn("m-0 flex flex-col divide-y", className)}>
      <SummaryRow
        tall={tall}
        icon={IconPlugConnected}
        label="Paired with your dives"
        value={summary.paired}
      />
      <SummaryRow
        tall={tall}
        icon={IconFilePlus}
        label="Added as new dives"
        value={summary.added}
      />
      {summary.included > 0 && (
        <SummaryRow
          tall={tall}
          icon={IconFilePlus}
          label="Left-out dives included"
          value={summary.included}
        />
      )}
      <SummaryRow
        tall={tall}
        icon={IconPlayerSkipForward}
        label="Already imported, skipped"
        value={summary.alreadyImported}
        muted
      />
      <SummaryRow
        tall={tall}
        icon={IconSwimming}
        label="Freedives and false starts left out"
        value={summary.leftOut}
        muted
      />
    </dl>
  )
}
