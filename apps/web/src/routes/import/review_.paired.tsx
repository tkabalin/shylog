import { memo, useEffect, useMemo } from "react"
import type { DiveId, ImportPreview } from "@shylog/core"
import {
  IconChevronRight,
  IconClockEdit,
  IconDeviceWatch,
  IconNotebook,
} from "@tabler/icons-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { cn } from "cn"

import { diveCount } from "@/components/pickers/match"
import { useFrameLater } from "@/components/rolling-number"
import { Switch } from "@/components/ui/switch"
import { loadPending, setAdopt, useImport } from "@/data/import"
import { useLog, type LogView } from "@/data/log"
import { computerName } from "@/dive/form/values"
import { longDate } from "@/format/dates"
import {
  compareRows,
  withAdopted,
  type CompareKey,
  type CompareRow,
} from "@/import/compare"
import { useToReview } from "@/import/pairing"
import { ImportSection, ListCard } from "@/import/parts"
import { capital, offsetText, review, type Entry } from "@/import/review"
import { PageBar } from "@/you/bar"
import { listRow, pressable } from "@/you/parts"

export const Route = createFileRoute("/import/review_/paired")({
  component: PairedPage,
})

// PairedHifi: every pair by day, your start beside the computer's, and the
// values that differ, each opening its pairing. Above them, a switch per
// value that differs anywhere takes the computer's on every pair at once.
function PairedPage() {
  const { loaded, preview, overrides, adopt } = useImport()
  const { log } = useLog()
  const toReview = useToReview()

  useEffect(() => {
    if (!loaded) loadPending().catch(() => {})
  }, [loaded])
  useEffect(() => {
    if (loaded && !preview) toReview()
  }, [loaded, preview, toReview])

  // Each pair compared once, not again on every switch.
  const pairs = useMemo(() => {
    if (!preview || !log) return []
    return review(preview, overrides, log.dive).paired.map((pair) => ({
      ...pair,
      // Before any value is taken, so a switch never hides its own row.
      rows: compareRows(pair.entry.dive, log.dive.get(pair.diveId)),
    }))
  }, [preview, overrides, log])
  // The list takes the values a frame after a switch, so the switch moves
  // on the tap's frame rather than after every row has re-rendered.
  const listAdopt = useFrameLater(adopt)

  if (!preview || !log) return null
  const name = computerName(preview.computerModel)

  return (
    <div className="flex flex-col">
      <PageBar
        back={{ label: "Review", to: "/import/review" }}
        title="Paired"
      />
      <div className="flex flex-col gap-5 px-4 pt-2 pb-[max(2rem,env(safe-area-inset-bottom))] md:mx-auto md:w-full md:max-w-xl">
        <p className="px-1 text-sm leading-normal text-muted-foreground">
          {!pairs.length
            ? "No dives are paired."
            : pairs.some(({ rows }) => rows.some((row) => row.differs))
              ? `Your values stay unless switched on below. Your ${name} adds its profile.`
              : `Your values stay. Your ${name} adds its profile.`}
        </p>
        <UseComputer
          name={name}
          rows={pairs.map(({ rows }) => rows)}
          adopt={adopt}
        />
        <PairDays
          pairs={pairs}
          preview={preview}
          log={log}
          adopt={listAdopt}
          name={name}
        />
      </div>
    </div>
  )
}

interface Pair {
  entry: Entry
  diveId: DiveId
  rows: CompareRow[]
}

const PairDays = memo(function PairDays({
  pairs,
  preview,
  log,
  adopt,
  name,
}: {
  pairs: Pair[]
  preview: ImportPreview
  log: LogView
  adopt: CompareKey[]
  name: string
}) {
  const days = new Map<string, Pair[]>()
  for (const pair of pairs) {
    const list = days.get(pair.entry.dive.day) ?? []
    list.push(pair)
    days.set(pair.entry.dive.day, list)
  }
  return [...days].map(([date, pairs]) => {
    const offset = preview.days.find((day) => day.date === date)?.offset
    return (
      <ImportSection
        key={date}
        title={longDate(date)}
        aside={
          offset ? (
            <span className="inline-flex items-center gap-1 font-normal">
              <IconClockEdit aria-hidden className="size-[1.15em]" />
              {capital(name)} clock moved {offsetText(offset)}
            </span>
          ) : null
        }
      >
        <ListCard>
          {pairs.map(({ entry, diveId, rows: compared }) => {
            const hand = log.dive.get(diveId)
            const rows = withAdopted(compared, adopt)
            const start = rows.find((row) => row.key === "start")!
            const differ = rows.filter(
              (row) => row.differs && row.key !== "start"
            )
            return (
              <PairRow
                key={entry.dive.ref}
                diveRef={entry.dive.ref}
                site={
                  (hand && log.sites.get(hand.siteId)?.name) ?? "Unknown site"
                }
                startMine={start.mine}
                startTheirs={start.theirs}
                startDiffers={start.differs}
                mine={differ.map((row) => row.mine).join(", ")}
                theirs={differ.map((row) => row.theirs).join(", ")}
                name={name}
              />
            )
          })}
        </ListCard>
      </ImportSection>
    )
  })
})

// Memoised on its text, so a switch re-renders only the rows it changes.
const PairRow = memo(function PairRow({
  diveRef,
  site,
  startMine,
  startTheirs,
  startDiffers,
  mine,
  theirs,
  name,
}: {
  diveRef: string
  site: string
  startMine: string
  startTheirs: string
  startDiffers: boolean
  // The other values that differ, joined; empty when none do.
  mine: string
  theirs: string
  name: string
}) {
  return (
    <Link
      to="/import/review/computer/$ref"
      params={{ ref: diveRef }}
      state={{ pushed: true }}
      className={cn(listRow, pressable, "py-3")}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-base font-medium tracking-[-0.015em]">
          {site}
        </span>
        {/* One grid for both lines, so the computer's values
              start in one column, just after the widest of yours. */}
        <span className="grid grid-cols-[minmax(4.25rem,max-content)_minmax(0,1fr)] items-center gap-x-2.5 gap-y-0.5 text-[13px] text-muted-foreground tabular-nums">
          <Line
            mine={startMine}
            theirs={startTheirs}
            name={name}
            // Counted in the review's "differ" too.
            warn={startDiffers}
          />
          {mine && <Line mine={mine} theirs={theirs} name={name} warn />}
        </span>
      </span>
      <IconChevronRight
        aria-hidden
        className="size-4.5 shrink-0 text-muted-foreground/60"
      />
    </Link>
  )
})

const valueLabels: Record<CompareKey, string> = {
  start: "Start time",
  maxDepth: "Max depth",
  averageDepth: "Average depth",
  duration: "Duration",
  water: "Water temperature",
  gas: "Gas",
}

// One switch per value that differs on any pair, with how many it changes.
function UseComputer({
  name,
  rows,
  adopt,
}: {
  name: string
  rows: CompareRow[][]
  adopt: CompareKey[]
}) {
  const counts = new Map<CompareKey, number>()
  for (const pair of rows)
    for (const row of pair)
      if (row.differs) counts.set(row.key, (counts.get(row.key) ?? 0) + 1)
  if (!counts.size) return null
  const keys = (Object.keys(valueLabels) as CompareKey[]).filter((key) =>
    counts.has(key)
  )
  return (
    <ImportSection title={`Use your ${name}’s values`}>
      <ListCard>
        {keys.map((key) => {
          const id = `use-computer-${key}`
          return (
            <div key={key} className="flex items-center gap-4 px-4 py-3">
              <label
                htmlFor={id}
                className="flex flex-1 flex-col gap-0.5 select-none"
              >
                <span className="text-[15px]">{valueLabels[key]}</span>
                <span className="text-[13px] text-muted-foreground tabular-nums">
                  {diveCount(counts.get(key)!)}
                </span>
              </label>
              <Switch
                id={id}
                checked={adopt.includes(key)}
                onCheckedChange={(on) =>
                  setAdopt(
                    on
                      ? [...adopt, key]
                      : adopt.filter((taken) => taken !== key)
                  )
                }
              />
            </div>
          )
        })}
      </ListCard>
    </ImportSection>
  )
}

// Yours beside the Log's notebook, then the computer's beside its watch:
// two cells of the row's grid.
function Line({
  mine,
  theirs,
  name,
  warn,
}: {
  mine: string
  theirs: string
  name: string
  warn?: boolean
}) {
  return (
    <>
      <span className="flex min-w-0 items-center">
        <IconNotebook aria-hidden className="mr-1 size-[1.15em] shrink-0" />
        <span className="truncate">
          <span className="sr-only">Yours: </span>
          {mine}
        </span>
      </span>
      <span className="flex min-w-0 items-center">
        <IconDeviceWatch aria-hidden className="mr-1 size-[1.15em] shrink-0" />
        <span className={cn("truncate", warn && "text-warn")}>
          <span className="sr-only">{name}: </span>
          {theirs}
        </span>
      </span>
    </>
  )
}
