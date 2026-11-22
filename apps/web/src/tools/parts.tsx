import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import {
  IconCheck,
  IconMinus,
  IconPlus,
  IconSelector,
} from "@tabler/icons-react"
import { cn } from "cn"

import { Card } from "@/components/ui/card"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Haptic } from "@/lib/haptic"
import { isReturn } from "@/lib/keys"
import {
  modelDetail,
  ndlModels,
  setNdlModel,
  useNdlModel,
} from "@/tools/ndl-model"

// A small heading over a tool's card, as You's sections have.
export function ToolHeading({
  id,
  children,
}: {
  id: string
  children: ReactNode
}) {
  return (
    <h2
      id={id}
      className="mb-2 px-1 text-[13px] font-semibold text-muted-foreground"
    >
      {children}
    </h2>
  )
}

// A tool's figure and stepper, kept in view under the bar while the table
// scrolls with the page, so a step's glide can be watched and stepped
// again. Its height goes to the page, for the table's header to stick below.
export function Controls({
  labelledBy,
  children,
}: {
  labelledBy: string
  children: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const section = ref.current!
    const page = section.parentElement!
    // Rounded down, as a header stuck half a pixel lower lets rows show
    // through above it.
    const measure = () =>
      page.style.setProperty(
        "--controls",
        `${Math.floor(section.getBoundingClientRect().height)}px`
      )
    // At once too, as the table centres itself before the observer reports.
    measure()
    // Whether the table's header has stuck below, for the cap.
    const table = page.querySelector<HTMLElement>("[role=table]")
    const header = table?.querySelector<HTMLElement>("[role=row]")
    const scroller = section.closest<HTMLElement>("#main")
    const stick = () => {
      if (!table || !header) return
      const top = header.getBoundingClientRect().top
      const stuck =
        table.getBoundingClientRect().top < top - 0.5 &&
        Math.abs(top - section.getBoundingClientRect().bottom) < 2
      section.toggleAttribute("data-stuck", stuck)
    }
    // A resize moves the header without a scroll: the controls unpinned
    // on a turned phone, or a shorter table pulling the page up.
    const observer = new ResizeObserver(() => {
      measure()
      stick()
    })
    observer.observe(section)
    if (table) observer.observe(table)
    stick()
    scroller?.addEventListener("scroll", stick, { passive: true })
    return () => {
      observer.disconnect()
      scroller?.removeEventListener("scroll", stick)
    }
  }, [])
  return (
    <section
      ref={ref}
      aria-labelledby={labelledBy}
      // Not pinned on a screen too short to leave the table room, such as
      // a phone on its side.
      className="group/controls sticky top-[calc(3.25rem+env(safe-area-inset-top))] z-20 -mx-4 bg-background px-4 pt-2 pb-4 [@media(max-height:30rem)]:static"
    >
      {children}
      {/* The card's rounded top, drawn over the stuck header: the card
          clips what's inside it, and its edge is drawn outside it, so
          neither can curve where the card's top has scrolled away. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-[15px] top-[calc(var(--controls,0px)-1px)] hidden h-[13px] [--edge:color-mix(in_oklab,var(--foreground)_10%,var(--background))] [background:radial-gradient(circle_at_13px_13px,transparent_11.5px,var(--edge)_12px,var(--edge)_12.5px,var(--background)_13px)_left_top/13px_13px_no-repeat,radial-gradient(circle_at_0_13px,transparent_11.5px,var(--edge)_12px,var(--edge)_12.5px,var(--background)_13px)_right_top/13px_13px_no-repeat,linear-gradient(var(--edge),var(--edge))_13px_0/calc(100%-26px)_1px_no-repeat] group-data-stuck/controls:block"
      />
    </section>
  )
}

// A tool's table's header row, stuck below the controls, which draw the
// card's rounded top over it. Its own line on top shows where the controls
// aren't pinned; at the card's top the card clips it.
export const stuckHeader =
  "sticky top-[calc(3.25rem+env(safe-area-inset-top)+var(--controls,0px))] z-[15] bg-card shadow-[0_-1px_0_color-mix(in_oklab,var(--foreground)_10%,transparent)] [@media(max-height:30rem)]:top-[calc(3.25rem+env(safe-area-inset-top))]"

const stepButton =
  "relative inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted text-foreground transition-[scale,opacity] duration-150 ease-out select-none hover:opacity-80 active:scale-96 active:opacity-70 active:duration-0 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-40 desk:size-10"

// The boards' big figure between a minus and a plus, typed or stepped.
export function Stepper({
  label,
  value,
  placeholder,
  unit,
  inputMode,
  onType,
  onDone,
  onStep,
  less,
  more,
  atLeast,
  atMost,
  children,
}: {
  // For screen readers, as the figure has no visible label.
  label: string
  value: string
  placeholder?: string
  unit: string
  inputMode: "numeric" | "decimal"
  onType: (text: string) => void
  // The field is left, so what was typed can show as the value it gave.
  onDone: () => void
  onStep: (direction: -1 | 1) => void
  less: string
  more: string
  // At the ends of the range, so a step that can't change anything is off.
  atLeast?: boolean
  atMost?: boolean
  children?: ReactNode
}) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <button
          type="button"
          aria-label={less}
          disabled={atLeast}
          onClick={() => onStep(-1)}
          className={stepButton}
        >
          <IconMinus aria-hidden className="size-5" />
          <Haptic />
        </button>
        <label className="flex min-w-0 flex-1 items-baseline justify-center gap-1">
          <span className="sr-only">{label}</span>
          <input
            type="text"
            inputMode={inputMode}
            enterKeyHint="done"
            autoComplete="off"
            value={value}
            placeholder={placeholder}
            onChange={(event) => onType(event.target.value)}
            onKeyDown={(event) => {
              if (isReturn(event)) event.currentTarget.blur()
            }}
            onBlur={onDone}
            onFocus={(event) => {
              // Again after the tap: WebKit's mouseup clears a selection
              // made on focus, and typing would add to the old figure.
              const input = event.currentTarget
              input.select()
              requestAnimationFrame(() => {
                if (document.activeElement === input) input.select()
              })
            }}
            className="w-full max-w-32 min-w-0 bg-transparent p-0 text-right text-[44px] leading-[52px] font-semibold tracking-[-0.03em] tabular-nums outline-none placeholder:text-muted-foreground/45"
          />
          {/* As faint as the placeholder while the figure is blank. */}
          <span
            className={cn(
              "text-xl font-medium text-muted-foreground",
              !value && "text-muted-foreground/45"
            )}
          >
            {unit}
          </span>
        </label>
        <button
          type="button"
          aria-label={more}
          disabled={atMost}
          onClick={() => onStep(1)}
          className={stepButton}
        >
          <IconPlus aria-hidden className="size-5" />
          <Haptic />
        </button>
      </div>
      {children}
    </Card>
  )
}

// The NDL column's heading, with the model its figures come from: one
// choice both tools share, picked from either. In the heading, so it stays
// in view once the header sticks.
export function NdlHeading({ className }: { className?: string }) {
  const model = useNdlModel()
  const [open, setOpen] = useState(false)
  const label = ndlModels.find((option) => option.value === model)!.label
  return (
    <span role="columnheader" className={cn("text-right", className)}>
      NDL{" "}
      <button
        type="button"
        aria-label={`NDL model, ${label}`}
        onClick={() => setOpen(true)}
        // Its tap area grown to about 44px.
        className="relative inline-flex cursor-pointer items-center gap-0.5 whitespace-nowrap text-foreground transition-opacity duration-150 ease-out after:absolute after:-inset-x-2 after:-inset-y-3.5 hover:opacity-70 active:opacity-50 active:duration-0"
      >
        {label}
        <IconSelector aria-hidden className="size-3.5 text-muted-foreground" />
      </button>
      <Drawer showSwipeHandle open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader className="pb-4">
            <DrawerTitle>NDL model</DrawerTitle>
          </DrawerHeader>
          <div
            role="listbox"
            aria-label="NDL model"
            className="overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            {ndlModels.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={model === option.value}
                onClick={() => {
                  setNdlModel(option.value)
                  setOpen(false)
                }}
                className="flex min-h-15 w-full items-center gap-3 border-t px-4 py-2 text-left transition-colors duration-150 hover:bg-muted/60 data-press:bg-muted data-press:duration-0"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-base font-medium">{option.label}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {modelDetail[option.value]}
                  </span>
                </span>
                {model === option.value && (
                  <IconCheck
                    aria-hidden
                    className="size-5 shrink-0 text-primary"
                  />
                )}
              </button>
            ))}
            {/* What the figures count, which no table says. */}
            <p className="border-t px-4 pt-3 text-[13px] text-muted-foreground">
              Bühlmann plans a first dive of the day as Subsurface does: down at
              18 m/min, then straight up at 9 m/min. The Navy table is read at
              the next deeper row, nitrox at its equivalent air depth. Both
              count from leaving the surface.
            </p>
          </div>
        </DrawerContent>
      </Drawer>
    </span>
  )
}
