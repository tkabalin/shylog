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

// The tag pill takes several, which a dive matches if it has any of them.
// "Any tag" clears the choice, as it does on the single pills. A tag from a
// link that no dive uses is still listed, so it can be unticked on its own.
function TagSelect({
  value,
  used,
  onChange,
  onOpenChange,
  onOpenChangeComplete,
}: {
  value: Tag[]
  used: ReadonlySet<string>
  onChange: (value: Tag[]) => void
  onOpenChange: (open: boolean) => void
  onOpenChangeComplete: (open: boolean) => void
}) {
  const options = [
    { value: all, label: "Any tag" },
    ...(Object.keys(tags) as Tag[])
      .filter((tag) => used.has(tag) || value.includes(tag))
      .map((tag) => ({ value: tag, label: tags[tag].label })),
  ]
  const labelOf = (tag: Tag) => tags[tag].label
  // One tag by name, more as "Night + 1", as the dive form's buddy row reads.
  const text = !value.length
    ? "Any tag"
    : `${labelOf(value[0]!)}${value.length > 1 ? ` + ${value.length - 1}` : ""}`
  return (
    <Select
      multiple
      items={options}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      value={value.length ? value : [all]}
      onValueChange={(next: string[]) =>
        onChange(
          next.includes(all) && value.length
            ? []
            : (next.filter((tag) => tag !== all) as Tag[])
        )
      }
    >
      <SelectTrigger
        variant="pill"
        aria-label={`Tag, ${value.map(labelOf).join(", ") || "Any tag"}`}
        data-active={value.length ? "" : undefined}
      >
        <SelectValue>{() => text}</SelectValue>
      </SelectTrigger>
      <FilterMenu options={options} />
    </Select>
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
  // The tag menu stays open while tags are picked, so Clear folds in or out
  // only once it has closed: the pills moving would slide it under a finger.
  const [held, setHeld] = useState<boolean | null>(null)
  const any = held ?? filtered
  usePreloadRangeSheet()

  return (
    <div
      role="group"
      aria-label="Filters"
      className="-mx-4 flex [scrollbar-width:none] gap-1 overflow-x-auto overscroll-x-contain px-3.5 py-1"
    >
      {/* First, so it shows without scrolling the row. It keeps its width
          and fades while the pills after it slide over by transform, so the
          row never lays out mid-slide as the Log's list commits. */}
      <Fold open={any} appear={false} timing="pill" className="shrink-0">
        <button
          type="button"
          aria-label="Clear filters"
          onClick={() => onChange({})}
          className={cn(pillTrigger, "pr-2.5 text-foreground")}
        >
          <IconX aria-hidden />
          Clear
        </button>
      </Fold>
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
        onOpenChange={(open) => {
          if (open) setHeld(filtered)
        }}
        onOpenChangeComplete={(open) => {
          if (!open) setHeld(null)
        }}
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
