import { useEffect, useRef, useState } from "react"
import { IconCheck } from "@tabler/icons-react"
import { cn } from "cn"

import { Drawer, DrawerContent } from "@/components/ui/drawer"
import { interval } from "@/format/figures"

import { BarButton, SheetBar } from "./sheet"

// The surface interval's three cases: worked out from the log, no previous
// dive, or a figure set by hand, in whole minutes.
export type IntervalChoice = null | "none" | { minutes: number }

// An override is capped at 48 hours; longer is no previous dive (Limits).
const longest = 48 * 60
// Wheel rows are 44 px, the touch target, with two showing either side.
const rowHeight = 44

// The surface interval as a sheet (D29): hours and minutes wheels like the
// iOS Timer, with Calculated and No previous dive as rows. Touching a wheel
// picks by hand at once; Done saves, a swipe or Cancel leaves it.
export function IntervalSheet({
  open,
  onOpenChange,
  value,
  calculated,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: IntervalChoice
  // The server's figure in seconds, "none", or undefined until it uploads.
  calculated: number | "none" | undefined
  onChange: (value: IntervalChoice) => void
}) {
  const [draft, setDraft] = useState(value)
  // The wheels show the figure by hand, or else the calculated one, which
  // stays put (dimmed) while No previous dive is chosen.
  const [shown, setShown] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  // Each opening starts from the form's value.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDraft(value)
      setShown(
        value && value !== "none"
          ? value.minutes
          : typeof calculated === "number"
            ? Math.round(calculated / 60)
            : 0
      )
    }
  }
  const minutes =
    draft && draft !== "none"
      ? draft.minutes
      : typeof calculated === "number" && draft == null
        ? Math.round(calculated / 60)
        : shown
  const pick = (next: IntervalChoice) => {
    if (next && next !== "none") setShown(next.minutes)
    else setShown(minutes)
    setDraft(next)
  }
  const byHand = (next: number) => pick({ minutes: Math.min(next, longest) })
  const start = () => {
    if (!draft || draft === "none") byHand(minutes)
  }

  return (
    <Drawer showSwipeHandle open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="md:mx-auto md:max-w-md md:border-x">
        <SheetBar
          title="Surface interval"
          start={
            <BarButton onClick={() => onOpenChange(false)}>Cancel</BarButton>
          }
          end={
            <BarButton
              strong
              onClick={() => {
                onChange(draft)
                onOpenChange(false)
              }}
            >
              Done
            </BarButton>
          }
        />
        <div className="flex flex-col pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* A drag on the wheels turns them, never pulls the sheet. */}
          <div
            data-base-ui-swipe-ignore
            className={cn(
              "relative mx-4 my-2 flex items-center justify-center gap-2 transition-opacity duration-200 ease-out",
              draft === "none" && "opacity-40"
            )}
          >
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-11 -translate-y-1/2 rounded-lg bg-muted" />
            <Wheel
              label="Hours"
              count={longest / 60 + 1}
              value={Math.floor(minutes / 60)}
              unit="h"
              onStart={start}
              onChange={(h) => byHand(h * 60 + (minutes % 60))}
            />
            <Wheel
              label="Minutes"
              count={60}
              value={minutes % 60}
              unit="min"
              onStart={start}
              onChange={(m) => byHand(Math.floor(minutes / 60) * 60 + m)}
            />
          </div>
          <Choice
            label="Calculated"
            detail={
              calculated === undefined
                ? "When saved"
                : calculated === "none"
                  ? "No previous dive"
                  : interval(calculated)
            }
            selected={draft == null}
            onClick={() => pick(null)}
          />
          <Choice
            label="No previous dive"
            selected={draft === "none"}
            onClick={() => pick("none")}
          />
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function Choice({
  label,
  detail,
  selected,
  onClick,
}: {
  label: string
  detail?: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="flex min-h-13 w-full items-center gap-3 border-t px-4 py-2 text-left transition-colors duration-150 hover:bg-muted/60 active:bg-muted active:duration-0"
    >
      <span className="flex-1 text-base font-medium">{label}</span>
      {detail && (
        <span className="text-base text-muted-foreground tabular-nums">
          {detail}
        </span>
      )}
      <IconCheck
        aria-hidden
        className={cn("size-5 shrink-0 text-primary", !selected && "invisible")}
      />
    </button>
  )
}

// One wheel: a scroll-snapped column read once it settles. A tapped number
// scrolls to the middle, and a value set from outside (Calculated, the 48 h
// cap) turns the wheel to it.
function Wheel({
  label,
  count,
  value,
  unit,
  onStart,
  onChange,
}: {
  label: string
  count: number
  value: number
  unit: string
  onStart: () => void
  onChange: (value: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const placed = useRef(false)
  const settle = useRef(0)
  useEffect(() => {
    const wheel = ref.current
    if (!wheel) return
    // Where it opens, at once; after that, turning.
    if (Math.round(wheel.scrollTop / rowHeight) !== value)
      wheel.scrollTo({
        top: value * rowHeight,
        behavior:
          placed.current &&
          !matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "smooth"
            : "instant",
      })
    placed.current = true
  }, [value])
  useEffect(() => () => clearTimeout(settle.current), [])
  return (
    <div className="relative flex w-28 items-center">
      <div
        ref={ref}
        role="listbox"
        aria-label={label}
        // A finger or a mouse wheel, not the scroll that places it.
        onPointerDown={onStart}
        onWheel={onStart}
        onScroll={(event) => {
          const top = event.currentTarget.scrollTop
          clearTimeout(settle.current)
          settle.current = window.setTimeout(() => {
            const next = Math.round(top / rowHeight)
            if (next !== value) onChange(next)
          }, 80)
        }}
        className="h-55 w-14 snap-y snap-mandatory [scrollbar-width:none] overflow-y-scroll overscroll-contain [mask-image:linear-gradient(transparent,black_35%,black_65%,transparent)] py-22 [&::-webkit-scrollbar]:hidden"
      >
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            role="option"
            aria-selected={i === value}
            tabIndex={-1}
            onClick={() => {
              onStart()
              onChange(i)
            }}
            className="flex h-11 w-full snap-center items-center justify-end pr-1 text-xl font-medium tabular-nums"
          >
            {i}
          </button>
        ))}
      </div>
      <span aria-hidden className="pl-1 text-base font-medium">
        {unit}
      </span>
    </div>
  )
}
