import { createElement, useId, useState, type ComponentType } from "react"
import {
  IconArrowBarToDown,
  IconArrowsHorizontal,
  IconArrowWaveRightUp,
  IconBarbell,
  IconBuildingStore,
  IconCalendar,
  IconCalendarStats,
  IconCamera,
  IconChevronDown,
  IconCloud,
  IconHourglass,
  IconLuggage,
  IconMap,
  IconMapPin,
  IconMoon,
  IconPool,
  IconRipple,
  IconScubaDivingTank,
  IconSunrise,
  IconTag,
  IconTemperature,
  IconTemperatureSnow,
  IconTrendingDown,
  IconTrendingUp,
  IconUsers,
  IconUserStar,
  IconWind,
} from "@tabler/icons-react"
import { cn } from "cn"

import { Opening, useKept } from "../charts/parts"
import type { Pattern } from "./catalogue"
import { ThresholdStrip } from "./threshold-strip"

type Icon = ComponentType<{ className?: string }>

// A figure and its unit, and a date's parts, never part at a line's end:
// "16 °C", "20 dives", "2.3 a dive", "10 Feb 2019", "July 2026".
const nbsp = String.fromCharCode(160)
const monthNames =
  "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December"
const glued = (text: string) =>
  text
    .replace(
      new RegExp(
        `(\\d) (?=°C|(?:m|min|L/min|a dive|dives?|days?|months?|years?|${monthNames})\\b)`,
        "g"
      ),
      `$1${nbsp}`
    )
    .replace(new RegExp(`\\b(${monthNames}) (?=\\d{4})`, "g"), `$1${nbsp}`)
    .replace(/\ba dive\b/g, `a${nbsp}dive`)

// What a pattern compares its measure across, as the board draws its
// findings: the current for "higher in moderate or stronger current", so
// the rows under one measure on All patterns tell apart at a glance.
const fieldIcons: Record<string, Icon> = {
  current: IconArrowWaveRightUp,
  surge: IconArrowsHorizontal,
  workload: IconBarbell,
  thermalComfort: IconTemperatureSnow,
  depthBand: IconArrowBarToDown,
  waterTemperatureBand: IconTemperature,
  gas: IconScubaDivingTank,
  cylinderMaterial: IconScubaDivingTank,
  cylinderVolume: IconScubaDivingTank,
  timeOfDay: IconSunrise,
  entry: IconPool,
  weather: IconCloud,
  surface: IconRipple,
  region: IconMap,
  site: IconMapPin,
  month: IconCalendar,
  diveCentre: IconBuildingStore,
  buddy: IconUsers,
  professional: IconUserStar,
  trip: IconLuggage,
  drySuit: IconTag,
  night: IconMoon,
  drift: IconWind,
  photoVideo: IconCamera,
  // A change compares years or halves of the log; records are about time.
  year: IconCalendarStats,
  gap: IconHourglass,
}

// A trend by its direction; a season, about temperature, by a thermometer.
// An element rather than the component, as one picked during render would
// be a new component type to React each time.
function iconOf(pattern: Pattern, className: string) {
  const icon =
    pattern.type === "trend"
      ? pattern.words[1].startsWith("up")
        ? IconTrendingUp
        : IconTrendingDown
      : pattern.type === "season"
        ? IconTemperature
        : pattern.type === "record" && pattern.field === "month"
          ? IconCalendarStats
          : (fieldIcons[pattern.field] ?? IconCalendarStats)
  return createElement(icon, { className })
}

// StatsHifi's finding: an icon in an accent circle and the sentence beside
// it, its figure in bold. A tap opens the groups behind it in place, kept
// open for Back; a record has none.
export function PatternRow({ pattern }: { pattern: Pattern }) {
  const [open, setOpen] = useKept(`pattern ${pattern.id}`, false)
  // Back restores it open at once; a tap eases it open.
  const [still, setStill] = useState(true)
  const id = useId()
  const [before, figure, after] = pattern.words
  const content = (
    <>
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/9 text-primary dark:bg-primary/14"
      >
        {iconOf(pattern, "size-[17px] stroke-[1.9]")}
      </span>
      <span className="min-w-0 flex-1 text-sm/[1.45] text-pretty text-muted-foreground tabular-nums">
        {glued(before)}
        <span className="font-semibold text-foreground">{glued(figure)}</span>
        {glued(after)}
      </span>
    </>
  )
  // The same padding as the conditions' rows, so the chevrons line up with
  // theirs and the All patterns row's. The icon and chevron centre on the
  // sentence, as on the board's top-aligned rows a second line hung below
  // them.
  const row = "flex w-full items-center gap-3 py-3.5 pr-3 pl-4 text-left"
  if (!pattern.groups.length) return <div className={row}>{content}</div>
  return (
    // Hovering the sentence tints the groups open under it too, so the open
    // item reads as one rather than a tinted strip over a plain block.
    <div className="transition-colors duration-150 control-hover:bg-muted/60">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? `${id}-groups` : undefined}
        onClick={() => {
          setStill(false)
          setOpen(!open)
        }}
        className={cn(
          row,
          "transition-colors duration-150 outline-none select-none [-webkit-touch-callout:none] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset data-press:bg-muted data-press:duration-0"
        )}
      >
        {content}
        <IconChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <Opening instant={still}>
          {pattern.strip && (
            <div className="pt-1 pr-4 pb-3.5 pl-15">
              <ThresholdStrip strip={pattern.strip} />
            </div>
          )}
          <Groups id={`${id}-groups`} pattern={pattern} />
        </Opening>
      )}
    </div>
  )
}

// The groups the sentence compares, each with how many dives it has and
// its figure, under the sentence rather than the icon.
function Groups({ id, pattern }: { id: string; pattern: Pattern }) {
  return (
    <dl
      id={id}
      aria-label="Behind this pattern"
      className="flex flex-col gap-2.5 pr-4 pb-4 pl-15"
    >
      {pattern.groups.map((group, i) => (
        <div
          key={i}
          className={cn(
            "flex items-baseline gap-3 tabular-nums",
            group.quiet && "text-muted-foreground"
          )}
        >
          {/* The count or date under the name rather than beside it, where
              a name that just fitted pushed it onto a line of its own. */}
          <dt className="flex min-w-0 flex-1 flex-col gap-0.5 [overflow-wrap:anywhere]">
            <span className="text-sm font-medium">{glued(group.label)}</span>
            {/* A space the column drops, so it reads "Hard 11 dives" to a
                screen reader rather than "Hard11 dives". */}
            {group.detail && " "}
            {group.detail && (
              <span className="text-[13px] text-muted-foreground">
                {glued(group.detail)}
              </span>
            )}
          </dt>
          <dd className="shrink-0 text-sm font-medium whitespace-nowrap">
            {group.value}
            {group.unit && (
              <span className="text-[13px] text-muted-foreground">
                {" "}
                {group.unit}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
