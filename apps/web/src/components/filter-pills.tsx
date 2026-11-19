import { useMemo, useState } from "react"
import { tags, type Tag } from "@shylog/core"
import {
  IconArrowBarToDown,
  IconCalendar,
  IconClock,
  IconMap,
  IconX,
} from "@tabler/icons-react"
import { cn } from "cn"

import { Fold } from "@/components/fold"
import { RangeFilter, usePreloadRangeSheet } from "@/components/range-filter"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  pillTrigger,
} from "@/components/ui/select"
import type { LogView } from "@/data/log"
import { year } from "@/format/dates"
import { depthScale, durationScale, type Filters } from "@/log/filters"

const all = "all"

type Option = { value: string; label: string }

// As wide as its longest option, not the pill, so a long region name isn't
// cut off; one wider than the screen wraps. Statistics' year uses it too.
export function FilterMenu({ options }: { options: Option[] }) {
  return (
    <SelectContent
      alignItemWithTrigger={false}
      align="start"
      className="w-max max-w-(--available-width)"
    >
      {options.map((option) => (
        <SelectItem
          key={option.value}
          value={option.value}
          className="*:shrink *:whitespace-normal"
        >
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  )
}

function FilterSelect({
  name,
  label,
  icon,
  value,
  items,
  onChange,
}: {
  name: string
  label: string
  icon?: React.ReactNode
  value: string | undefined
  items: Option[]
  onChange: (value: string | undefined) => void
}) {
  const options = [{ value: all, label }, ...items]
  return (
    <Select
      items={options}
      value={value ?? all}
      onValueChange={(next) =>
        onChange(next === all || !next ? undefined : String(next))
      }
    >
      {/* A combobox can't take its name from its text, so the label says
          what it filters and what it is set to: "Year, 2026". */}
      <SelectTrigger
        variant="pill"
        aria-label={`${name}, ${options.find((o) => o.value === (value ?? all))?.label ?? label}`}
        data-active={value ? "" : undefined}
      >
        {icon}
        <SelectValue />
      </SelectTrigger>
      <FilterMenu options={options} />
    </Select>
  )
}

// A pill that takes several, which an item matches if it has any of them:
// the Log's tags and Explore's site types. Its first option ("Any tag")
// clears the choice, as it does on the single pills.
export function MultiFilter<T extends string>({
  name,
  any,
  options,
  value,
  onChange,
  onOpenChange,
  onOpenChangeComplete,
  className,
}: {
  name: string
  any: string
  options: { value: T; label: string }[]
  value: T[]
  onChange: (value: T[]) => void
  onOpenChange?: (open: boolean) => void
  onOpenChangeComplete?: (open: boolean) => void
  className?: string
}) {
  const items = [{ value: all, label: any }, ...options]
  const labelOf = (item: T) =>
    options.find((option) => option.value === item)?.label ?? item
  // One by name, more as "Night + 1", as the dive form's buddy row reads.
  const text = !value.length
    ? any
    : `${labelOf(value[0]!)}${value.length > 1 ? ` + ${value.length - 1}` : ""}`
  return (
    <Select
      multiple
      items={items}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      value={value.length ? value : [all]}
      onValueChange={(next: string[]) =>
        onChange(
          next.includes(all) && value.length
            ? []
            : (next.filter((item) => item !== all) as T[])
        )
      }
    >
      <SelectTrigger
        variant="pill"
        aria-label={`${name}, ${value.map(labelOf).join(", ") || any}`}
        data-active={value.length ? "" : undefined}
        className={className}
      >
        <SelectValue>{() => text}</SelectValue>
      </SelectTrigger>
      <FilterMenu options={items} />
    </Select>
  )
}

// The tag pill lists only the tags the log uses, and a tag from a link that
// no dive uses, so it can be unticked on its own.
function TagSelect({
  value,
  used,
  ...props
}: {
  value: Tag[]
  used: ReadonlySet<string>
  onChange: (value: Tag[]) => void
  onOpenChange: (open: boolean) => void
  onOpenChangeComplete: (open: boolean) => void
}) {
  return (
    <MultiFilter
      name="Tag"
      any="Any tag"
      options={(Object.keys(tags) as Tag[])
        .filter((tag) => used.has(tag) || value.includes(tag))
        .map((tag) => ({ value: tag, label: tags[tag].label }))}
      value={value}
      {...props}
    />
  )
}

// A multi pill's menu stays open while options are ticked, so Clear folds
// in or out only once it has closed: the pills moving would slide it under
// a finger.
export function useClearShown(filtered: boolean) {
  const [held, setHeld] = useState<boolean | null>(null)
  return {
    shown: held ?? filtered,
    menu: {
      onOpenChange: (open: boolean) => {
        if (open) setHeld(filtered)
      },
      onOpenChangeComplete: (open: boolean) => {
        if (!open) setHeld(null)
      },
    },
  }
}

// First in a filter row, so it shows without scrolling the row. It keeps
// its width and fades while the pills after it slide over by transform, so
// the row never lays out mid-slide as a list commits under it.
export function ClearFilters({
  shown,
  onClear,
  fold = true,
  className,
}: {
  shown: boolean
  onClear: () => void
  // Off in a row that wraps, where the slide would carry pills across lines.
  fold?: boolean
  className?: string
}) {
  const button = (
    <button
      type="button"
      aria-label="Clear filters"
      onClick={onClear}
      className={cn(pillTrigger, "pr-2.5 text-foreground", className)}
    >
      <IconX aria-hidden />
      Clear
    </button>
  )
  if (!fold) return shown ? button : null
  return (
    <Fold open={shown} appear={false} timing="pill" className="shrink-0">
      {button}
    </Fold>
  )
}

// In the pill's text colour, as on the board; only the chevron is muted.
const iconClass = "text-current"

// LogHifi2's filter row, plus Depth and Duration after its pills.
// Lists only what the log uses, so no choice ever empties the Log.
export function FilterPills({
  log,
  filters,
  onChange,
}: {
  log: LogView
  filters: Filters
  onChange: (filters: Filters) => void
}) {
  const choices = useMemo(() => {
    const years = new Set<string>()
    const used = new Set<string>()
    const regions = new Set<string>()
    for (const dive of log.dives) {
      years.add(year(dive.startTime))
      for (const tag of log.links.get(dive.id)?.tags ?? []) used.add(tag)
      const region = log.sites.get(dive.siteId)?.regionId
      if (region) regions.add(region)
    }
    return {
      years: [...years]
        .sort()
        .reverse()
        .map((y) => ({ value: y, label: y })),
      tags: used,
      regions: [...regions]
        .map((id) => ({ value: id, label: log.regions.get(id)?.name ?? "" }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    }
  }, [log])
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  const filtered = Object.values(filters).some((value) => value !== undefined)
  const clear = useClearShown(filtered)
  usePreloadRangeSheet()

  return (
    <div
      role="group"
      aria-label="Filters"
      className="-mx-4 flex [scrollbar-width:none] gap-1 overflow-x-auto overscroll-x-contain px-3.5 py-1"
    >
      <ClearFilters shown={clear.shown} onClear={() => onChange({})} />
      <FilterSelect
        name="Year"
        label="All years"
        icon={<IconCalendar aria-hidden className={iconClass} />}
        value={filters.year}
        items={choices.years}
        onChange={(value) => set({ year: value })}
      />
      <TagSelect
        value={filters.tags ?? []}
        used={choices.tags}
        {...clear.menu}
        onChange={(tags) => set({ tags: tags.length ? tags : undefined })}
      />
      <FilterSelect
        name="Region"
        label="Any region"
        icon={<IconMap aria-hidden className={iconClass} />}
        value={filters.region}
        items={choices.regions}
        onChange={(value) => set({ region: value })}
      />
      <RangeFilter
        label="Depth"
        noun="depth"
        unit="m"
        unitName="metres"
        icon={IconArrowBarToDown}
        scale={depthScale}
        value={filters.depth}
        onApply={(depth) => set({ depth })}
      />
      <RangeFilter
        label="Duration"
        noun="duration"
        unit="min"
        unitName="minutes"
        icon={IconClock}
        scale={durationScale}
        value={filters.duration}
        onApply={(duration) => set({ duration })}
      />
    </div>
  )
}
