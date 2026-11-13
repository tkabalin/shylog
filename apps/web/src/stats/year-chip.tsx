import { useEffect, useRef } from "react"
import { IconCalendar } from "@tabler/icons-react"

import { FilterMenu } from "@/components/filter-pills"
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select"

const all = "all"

// StatsHifi's tinted chip beside the count, at the count line's 17 px, its
// touch area grown to about 44 px.
const chip = "h-auto gap-0.5 py-px pr-1.5 pl-2 text-[17px] after:-inset-y-2.5"

// The year beside the dive count: All time and each year with a dive, in
// the same menu as the Log's year pill, on a phone as with a mouse.
export function YearChip({
  value,
  years,
  onChange,
}: {
  value: string | undefined
  years: string[]
  onChange: (year: string | undefined) => void
}) {
  const options = [
    { value: all, label: "All time" },
    ...years.map((year) => ({ value: year, label: year })),
  ]
  const text = value ?? "all time"
  // The menu starts closing first and the year follows once a frame has
  // painted: the re-render it sets off held the close back. Cancelled if
  // the screen goes first, so a tab left at once stays left.
  const pending = useRef({ frame: 0, timeout: 0 })
  useEffect(() => {
    const later = pending.current
    return () => {
      cancelAnimationFrame(later.frame)
      clearTimeout(later.timeout)
    }
  }, [])
  const pick = (next: string | null) => {
    pending.current.frame = requestAnimationFrame(() => {
      pending.current.timeout = window.setTimeout(() =>
        onChange(next === all || !next ? undefined : next)
      )
    })
  }

  return (
    <Select items={options} value={value ?? all} onValueChange={pick}>
      {/* A combobox can't take its name from its text, so the label says
          what it picks and what it is set to, as the Log's pills do. */}
      <SelectTrigger
        variant="pill"
        aria-label={`Year, ${value ?? "All time"}`}
        data-active=""
        className={chip}
      >
        <IconCalendar aria-hidden />
        <SelectValue>{() => text}</SelectValue>
      </SelectTrigger>
      <FilterMenu options={options} />
    </Select>
  )
}
