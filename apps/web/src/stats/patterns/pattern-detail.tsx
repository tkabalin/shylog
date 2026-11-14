import {
  createElement,
  useId,
  useState,
  type ComponentType,
  type ReactNode,
} from "react"
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

import { Card } from "@/components/ui/card"

import { ExpandAll, Opening, Section, useKept } from "../charts/parts"
import type { Pattern } from "./catalogue"
import { PatternChart } from "./pattern-chart"

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
      ? pattern.rising
        ? IconTrendingUp
        : IconTrendingDown
      : pattern.type === "season"
        ? IconTemperature
        : pattern.type === "record" && pattern.field === "month"
          ? IconCalendarStats
          : (fieldIcons[pattern.field] ?? IconCalendarStats)
  return createElement(icon, { className })
}

// A section of patterns in a card, with Expand all in its heading as the
// Conditions and Habits sections have, what is open kept for Back.
export function PatternSection({
  id,
  title,
  patterns,
  children,
}: {
  id: string
  title: string
  patterns: Pattern[]
  // A row after the patterns, such as All patterns.
  children?: ReactNode
}) {
  const [shown, setShown] = useKept<ReadonlySet<string>>(
    `patterns ${id}`,
    new Set()
  )
  // Rows Back restores open at once; a tap eases them open.
  const [still, setStill] = useState(true)
  // Records say it all in their sentence and don't open.
  const openable = patterns.filter((p) => p.groups.length).map((p) => p.id)
  const open = (ids: Iterable<string>) => {
    setStill(false)
    setShown(new Set(ids))
  }
  const every = openable.length > 0 && openable.every((one) => shown.has(one))
  return (
    <Section
      id={id}
      title={title}
      action={
        openable.length > 0 && (
          <ExpandAll
            every={every}
            onClick={() => open(every ? [] : openable)}
          />
        )
      }
    >
      <Card className="gap-0 divide-y py-0">
        {patterns.map((pattern) => (
          <PatternRow
            key={pattern.id}
            pattern={pattern}
            open={shown.has(pattern.id)}
            still={still}
            onToggle={() => {
              const next = new Set(shown)
              if (!next.delete(pattern.id)) next.add(pattern.id)
              open(next)
            }}
          />
        ))}
        {children}
      </Card>
    </Section>
  )
}

// StatsHifi's finding: an icon in an accent circle and the sentence beside
// it, its figure in bold. A tap opens the groups behind it in place, with
// the dives drawn over them where there is a chart; a record has none.
function PatternRow({
  pattern,
  open,
  still,
  onToggle,
}: {
  pattern: Pattern
  open: boolean
  still: boolean
  onToggle: () => void
}) {
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
    // Hovering or pressing the sentence tints the groups open under it too,
    // so the open item reads as one rather than a strip over a plain block.
    <div className="transition-colors duration-150 has-[>button[data-press]]:bg-muted has-[>button[data-press]]:duration-0 control-hover:bg-muted/60">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? `${id}-groups` : undefined}
        onClick={onToggle}
        className={cn(
          row,
          "transition-colors duration-150 outline-none select-none [-webkit-touch-callout:none] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
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
          {pattern.chart && (
            <div className="pt-1 pr-4 pb-3.5 pl-15">
              <PatternChart
                chart={pattern.chart}
                labels={pattern.groups.map((group) => group.label)}
              />
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
