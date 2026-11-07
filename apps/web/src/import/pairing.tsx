import { useCallback, useRef, useState, type ReactNode } from "react"
import type { ComputerDive } from "@shylog/core"
import {
  IconArrowBarToDown,
  IconArrowBarToDownDashed,
  IconCalendarEvent,
  IconCheck,
  IconClock,
  IconClockPlay,
  IconScubaDivingTank,
  IconTemperature,
} from "@tabler/icons-react"
import { useRouter } from "@tanstack/react-router"
import { cn } from "cn"

import { Sparkline } from "@/components/sparkline"
import { Button } from "@/components/ui/button"
import { pressedButton, Reveal, type Icon } from "@/dive/form/rows"
import type { Dive } from "@/data/db"
import { PageBar } from "@/you/bar"

import { compareRows, takesComputerGas, type CompareRow } from "./compare"
import { bigButton, ImportSection, ListCard, Radio } from "./parts"
import { pairWarning, type Entry } from "./review"
import { gasDetail } from "@/format/figures"

export interface PairOption {
  key: string
  icon?: Icon
  label: ReactNode
  meta: ReactNode
  // Shown once chosen: what else the choice changes.
  note?: string | null
  current?: boolean
  on: boolean
  onPick: () => void
}

function OptionRow({ option }: { option: PairOption }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={option.on}
      onClick={option.onPick}
      className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 select-none [-webkit-touch-callout:none] hover:bg-muted/60 active:bg-muted active:duration-0"
    >
      <Radio on={option.on} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-base font-medium tracking-[-0.015em] tabular-nums">
          {option.icon && (
            <option.icon
              aria-hidden
              className="size-[1.15em] shrink-0 text-muted-foreground"
            />
          )}
          <span className="truncate">{option.label}</span>
        </span>
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {option.meta}
        </span>
        {option.on && option.note && (
          <span className="text-[13px] text-warn">{option.note}</span>
        )}
      </span>
      {option.current && (
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          Current
        </span>
      )}
    </button>
  )
}

export function OptionCard({
  heading,
  options,
}: {
  heading?: string
  options: PairOption[]
}) {
  return (
    <ListCard className="divide-y-0 [&>button+button]:border-t">
      {heading && (
        <span className="block px-4 pt-3 text-xs font-medium text-muted-foreground tabular-nums">
          {heading}
        </span>
      )}
      {options.map((option) => (
        <OptionRow key={option.key} option={option} />
      ))}
    </ListCard>
  )
}

// The profile from the preview's 24-point sparkline, at the card's width.
export function ComputerProfile({ dive }: { dive: ComputerDive }) {
  if (!dive.profile) return null
  return (
    <Sparkline
      points={dive.profile}
      maxDepth={dive.maxDepth}
      stretch
      className="h-16 w-full"
    />
  )
}

// The Compare table's labels, with the board's icons; the gas, which the
// board leaves out, has the tank the form uses for gear.
const rowIcons: Record<CompareRow["key"], Icon> = {
  start: IconClockPlay,
  maxDepth: IconArrowBarToDown,
  averageDepth: IconArrowBarToDownDashed,
  duration: IconClock,
  water: IconTemperature,
  gas: IconScubaDivingTank,
}

// ChangePairingHifi's Compare table, with the note under it: why the
// pairing may be wrong, or what the computer adds.
export function Compare({
  computer,
  hand,
  entry,
  name,
}: {
  computer: ComputerDive
  hand: Dive
  entry: Entry
  name: string
}) {
  const rows = compareRows(computer, hand)
  const warning = pairWarning(entry, hand)
  const gas = takesComputerGas(computer, hand)
    ? ` Its ${gasDetail(computer.oxygen ?? null)} replaces your air.`
    : ""
  return (
    <ImportSection title="Compare">
      <ListCard>
        <div
          aria-hidden
          className="grid min-h-8.5 grid-cols-[minmax(0,1fr)_6.75rem_6.75rem] items-end gap-x-2 px-4 pt-1 pb-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground"
        >
          <span />
          <span className="text-right">Yours</span>
          <span className="text-right">{name}</span>
        </div>
        {rows.map((row) => {
          const RowIcon = rowIcons[row.key]
          return (
            <div
              key={row.key}
              className="grid min-h-11 grid-cols-[minmax(0,1fr)_6.75rem_6.75rem] items-center gap-x-2 px-4 text-[15px] whitespace-nowrap tabular-nums"
            >
              <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                <RowIcon aria-hidden className="size-[1.15em] shrink-0" />
                <span className="truncate">{row.label}</span>
              </span>
              <span className="text-right">
                <span className="sr-only">Yours: </span>
                {row.mine}
              </span>
              <span
                className={cn(
                  "text-right",
                  row.differs && "font-semibold text-warn"
                )}
              >
                <span className="sr-only">
                  {name}
                  {row.differs ? ", differs" : ""}:{" "}
                </span>
                {row.theirs}
              </span>
            </div>
          )
        })}
      </ListCard>
      <p
        className={cn(
          "mt-2.5 px-1 text-[13px] leading-normal",
          warning ? "text-warn" : "text-muted-foreground"
        )}
      >
        {warning ??
          `Your values are kept. The ${name} adds its profile, temperatures and alarms.${gas}`}
      </p>
    </ImportSection>
  )
}

// Back to the review from a screen pushed over it, or a fresh review in
// its place when it was opened directly, so history never holds two.
export function useToReview() {
  const router = useRouter()
  // Stable and once only, so an effect that leaves on a re-render can't
  // step back twice before the screen unmounts.
  const left = useRef(false)
  return useCallback(() => {
    if (left.current) return
    left.current = true
    if (router.state.location.state.pushed && router.history.canGoBack())
      router.history.back()
    else void router.navigate({ to: "/import/review", replace: true })
  }, [router])
}

// The pairing screens' frame: the bar back to the review, the content,
// and Done, which goes back too, as each choice is kept as it's made.
export function PairingFrame({ children }: { children: ReactNode }) {
  const done = useToReview()
  return (
    <div className="flex min-h-full flex-col">
      <PageBar
        back={{ label: "Review", to: "/import/review" }}
        title="Pairing"
      />
      <div className="flex flex-1 flex-col gap-6 px-4 pt-2 pb-8 md:mx-auto md:w-full md:max-w-xl">
        {children}
      </div>
      <div className="sticky bottom-0 z-10 border-t bg-background px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-[calc(max(0rem,(100%-36rem)/2)+1rem)]">
        <Button className={cn(bigButton, "w-full")} onClick={done}>
          <IconCheck aria-hidden data-icon="inline-start" />
          Done
        </Button>
      </div>
    </div>
  )
}

// "Show dives from other days", and the list it opens, easing open on the
// tap. It starts open, without motion, when one of them is chosen already.
export function OtherDays({ options }: { options: PairOption[] }) {
  const [open, setOpen] = useState(options.some((option) => option.on))
  const [tapped, setTapped] = useState(false)
  if (!options.length) return null
  const list = <OptionCard heading="Other days" options={options} />
  if (open)
    // The bleed keeps the card's ring clear of Reveal's clipping, which
    // WebKit otherwise cuts at the top.
    return tapped ? <Reveal className="-m-px p-px">{list}</Reveal> : list
  return (
    <button
      type="button"
      onClick={() => {
        setTapped(true)
        setOpen(true)
      }}
      className={cn(
        "relative mx-1 inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-primary after:absolute after:-inset-y-3",
        pressedButton
      )}
    >
      <IconCalendarEvent aria-hidden className="size-[1.15em]" />
      Show dives from other days
    </button>
  )
}
