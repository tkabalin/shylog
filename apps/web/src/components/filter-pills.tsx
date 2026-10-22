import { useMemo } from "react"
import { tags, type Tag } from "@shylog/core"
import {
  IconArrowBarToDown,
  IconCalendar,
  IconHourglass,
  IconMap,
} from "@tabler/icons-react"

import { RangeFilter, usePreloadRangeSheet } from "@/components/range-filter"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { LogView } from "@/data/log"
import { year } from "@/format/dates"
import { depthScale, durationScale, type Filters } from "@/log/filters"

const all = "all"

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
  items: { value: string; label: string }[]
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
      <SelectContent alignItemWithTrigger={false} align="start">
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

// In the pill's text colour, as on the board; only the chevron is muted.
const iconClass = "text-current"

// LogHifi2's filter row, plus Depth and Duration after its pills (D25).
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
      tags: (Object.keys(tags) as Tag[])
        .filter((tag) => used.has(tag))
        .map((tag) => ({ value: tag, label: tags[tag].label })),
      regions: [...regions]
        .map((id) => ({ value: id, label: log.regions.get(id)?.name ?? "" }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    }
  }, [log])
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  usePreloadRangeSheet()

  return (
    <div
      role="group"
      aria-label="Filters"
      className="-mx-4 flex [scrollbar-width:none] gap-1 overflow-x-auto px-3.5 py-1"
    >
      <FilterSelect
        name="Year"
        label="All years"
        icon={<IconCalendar aria-hidden className={iconClass} />}
        value={filters.year}
        items={choices.years}
        onChange={(value) => set({ year: value })}
      />
      <FilterSelect
        name="Tag"
        label="Any tag"
        value={filters.tag}
        items={choices.tags}
        onChange={(value) => set({ tag: value as Tag | undefined })}
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
        icon={IconHourglass}
        scale={durationScale}
        value={filters.duration}
        onApply={(duration) => set({ duration })}
      />
    </div>
  )
}
