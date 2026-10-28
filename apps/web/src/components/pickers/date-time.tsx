import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
} from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { IconChevronDown, IconSelector } from "@tabler/icons-react"
import type { DropdownProps } from "react-day-picker"
import { cn } from "cn"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Select, SelectContent, SelectItem } from "@/components/ui/select"

// On a desktop (desk:) the form's date and time open these popovers rather
// than the native pickers, which Windows draws badly. The trigger reads as
// the row's value, as SelectRow's does.
const trigger =
  "flex h-11.5 min-w-0 flex-1 cursor-pointer items-center justify-end gap-1 text-right text-base font-medium tabular-nums desk:outline-none"

const pad = (n: number) => String(n).padStart(2, "0")
// The form keeps a date as "2026-10-28", a day on the calendar rather than
// an instant, so it goes to and from a local Date with no zone in it.
const toDay = (date: string) => {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(y, m - 1, d)
}
const fromDay = (day: Date) =>
  `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`

type Loaded = {
  Calendar: typeof import("@/components/ui/calendar").Calendar
  enGB: typeof import("react-day-picker/locale/en-GB").enGB
}

// Opens below its row, never beside it, when a short window has no room.
const below = { fallbackAxisSide: "none" } as const

export function DatePopover({
  id,
  value,
  text,
  onChange,
}: {
  id: string
  value: string
  // The date as the row shows it ("Wed 28 Oct 2026").
  text: string
  onChange: (date: string) => void
}) {
  const [open, setOpen] = useState(false)
  // The calendar's code is its own chunk, as a phone never shows it. It
  // loads when the row mounts, only on a desktop, so it's in by a click.
  const [loaded, setLoaded] = useState<Loaded>()
  useEffect(() => {
    void Promise.all([
      import("@/components/ui/calendar"),
      import("react-day-picker/locale/en-GB"),
    ]).then(([{ Calendar }, { enGB }]) => setLoaded({ Calendar, enGB }))
  }, [])
  const popup = useRef<HTMLDivElement>(null)
  const day = toDay(value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger id={id} aria-label={`Date, ${text}`} className={trigger}>
        {text}
        <IconSelector
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground/60"
        />
      </PopoverTrigger>
      <PopoverContent
        ref={popup}
        align="end"
        collisionAvoidance={below}
        // The picked day, so the arrows move it at once, not the month's
        // Previous button, the first thing that takes a tab.
        initialFocus={() =>
          popup.current?.querySelector<HTMLElement>(
            "td button[tabindex='0']"
          ) ?? true
        }
        className="w-auto p-0"
      >
        {loaded && (
          <loaded.Calendar
            mode="single"
            required
            selected={day}
            defaultMonth={day}
            // Monday first, and days read out as the row shows them.
            locale={loaded.enGB}
            // Six rows every month, so the edge doesn't jump on a turn.
            fixedWeeks
            // Month and year menus, as a logbook goes back years.
            captionLayout="dropdown"
            startMonth={new Date(1950, 0)}
            endMonth={new Date(new Date().getFullYear() + 1, 11)}
            components={{ Dropdown: MonthYearSelect }}
            onSelect={(next) => {
              onChange(fromDay(next))
              setOpen(false)
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

// The calendar's month and year menus as the form's Selects, dropping below
// the caption, rather than native ones, which Windows draws as the picker
// this replaces. The calendar reads a change as a native select's.
function MonthYearSelect({
  options = [],
  value,
  onChange,
  "aria-label": label,
}: DropdownProps) {
  const text = options.find((option) => option.value === Number(value))?.label
  return (
    <Select<number>
      value={Number(value)}
      onValueChange={(next) =>
        onChange?.({
          target: { value: String(next) },
        } as ChangeEvent<HTMLSelectElement>)
      }
    >
      <SelectPrimitive.Trigger
        aria-label={`${label}, ${text}`}
        // Above the calendar's nav, which spans the caption for its arrows.
        className="relative z-10 flex h-(--cell-size) cursor-pointer items-center gap-1 rounded-(--cell-radius) pr-1.5 pl-2 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted"
      >
        {text}
        <IconChevronDown
          aria-hidden
          className="size-3.5 text-muted-foreground"
        />
      </SelectPrimitive.Trigger>
      <SelectContent
        alignItemWithTrigger={false}
        // About a third of the years, not a list to the foot of the window.
        className="max-h-[min(18rem,var(--available-height))] w-auto min-w-24"
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// Hours and minutes as two columns, as Windows 11's time picker has. Each
// pick sets the time at once; Escape or a click away closes it.
export function TimePopover({
  id,
  value,
  placeholder,
  onChange,
  ...aria
}: {
  id: string
  value: string
  // "Required", or a dash once a save has asked for it.
  placeholder: string
  onChange: (time: string) => void
} & Pick<ComponentProps<"button">, "aria-invalid" | "aria-describedby">) {
  const [open, setOpen] = useState(false)
  const [hours, minutes] = (value || "09:00").split(":").map(Number)
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // An empty time opens at 09:00, a typical first dive, as on a phone.
        if (next && !value) onChange("09:00")
        setOpen(next)
      }}
    >
      <PopoverTrigger
        id={id}
        aria-label={`Start time, ${value || "not set"}`}
        className={trigger}
        {...aria}
      >
        <span className={cn(!value && "font-normal text-muted-foreground/60")}>
          {value || placeholder}
        </span>
        <IconSelector
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground/60"
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionAvoidance={below}
        className="w-auto gap-0 p-0"
      >
        <div className="flex gap-1 p-1.5">
          <Column
            label="Hours"
            count={24}
            value={hours}
            onPick={(h) => onChange(`${pad(h)}:${pad(minutes)}`)}
          />
          <Column
            label="Minutes"
            count={60}
            value={minutes}
            onPick={(m) => onChange(`${pad(hours)}:${pad(m)}`)}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

// One column: a list that opens with its pick in the middle, and turns a
// step with the arrow keys, to its ends with Home and End. A click leaves it
// where it is, so the number under the pointer stays the one picked.
function Column({
  label,
  count,
  value,
  onPick,
}: {
  label: string
  count: number
  value: number
  onPick: (value: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  const placed = useRef(false)
  // Scrolled by hand, not scrollIntoView, which would move the page too.
  useLayoutEffect(() => {
    const list = ref.current
    const picked = list?.querySelector<HTMLElement>("[aria-selected=true]")
    if (!list || !picked) return
    const top = picked.offsetTop
    const bottom = top + picked.offsetHeight
    if (!placed.current)
      list.scrollTop = top - (list.clientHeight - picked.offsetHeight) / 2
    // After that, only as far as keeps a pick by key in view.
    else if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight
    placed.current = true
  }, [value])
  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      aria-activedescendant={`${id}-${value}`}
      onKeyDown={(event) => {
        const next = {
          ArrowUp: value - 1,
          ArrowDown: value + 1,
          Home: 0,
          End: count - 1,
        }[event.key]
        if (next == null) return
        event.preventDefault()
        onPick(Math.min(count - 1, Math.max(0, next)))
      }}
      // No scrollbar, as Windows' own picker has none: a classic one would
      // take a fifth of the column. The wheel and the arrows scroll it.
      className="relative flex h-56 w-14 [scrollbar-width:none] flex-col overflow-y-auto overscroll-contain rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-scrollbar]:hidden"
    >
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          id={`${id}-${i}`}
          type="button"
          role="option"
          aria-selected={i === value}
          tabIndex={-1}
          onClick={() => onPick(i)}
          className={cn(
            "flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-sm tabular-nums hover:bg-muted",
            i === value &&
              "bg-primary font-medium text-primary-foreground hover:bg-primary"
          )}
        >
          {pad(i)}
        </button>
      ))}
    </div>
  )
}
