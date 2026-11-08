import { useEffect } from "react"
import {
  IconChevronRight,
  IconClockEdit,
  IconDeviceWatch,
  IconNotebook,
} from "@tabler/icons-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { cn } from "cn"

import { diveCount } from "@/components/pickers/match"
import { Switch } from "@/components/ui/switch"
import { loadPending, setAdopt, useImport } from "@/data/import"
import { useLog } from "@/data/log"
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
import { capital, offsetText, review } from "@/import/review"
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

  if (!preview || !log) return null
  const name = computerName(preview.computerModel)
  const { paired } = review(preview, overrides, log.dive)
  // Before any value is taken, so a switch never hides its own row.
  const differing = paired.map(({ entry, diveId }) =>
    compareRows(entry.dive, log.dive.get(diveId))
  )
  const days = new Map<string, typeof paired>()
  for (const pair of paired) {
    const list = days.get(pair.entry.dive.day) ?? []
    list.push(pair)
    days.set(pair.entry.dive.day, list)
  }

  return (
    <div className="flex flex-col">
      <PageBar
        back={{ label: "Review", to: "/import/review" }}
        title="Paired"
      />
      <div className="flex flex-col gap-5 px-4 pt-2 pb-[max(2rem,env(safe-area-inset-bottom))] md:mx-auto md:w-full md:max-w-xl">
        <p className="px-1 text-sm leading-normal text-muted-foreground">
          {!paired.length
            ? "No dives are paired."
            : differing.some((rows) => rows.some((row) => row.differs))
              ? `Your values stay unless switched on below. Your ${name} adds its profile.`
              : `Your values stay. Your ${name} adds its profile.`}
        </p>
        <UseComputer name={name} rows={differing} adopt={adopt} />
        {[...days].map(([date, pairs]) => {
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
                {pairs.map(({ entry, diveId }) => {
                  const hand = log.dive.get(diveId)
                  const rows = withAdopted(compareRows(entry.dive, hand), adopt)
                  const start = rows.find((row) => row.key === "start")!
                  const differ = rows.filter(
                    (row) => row.differs && row.key !== "start"
                  )
                  const site =
                    (hand && log.sites.get(hand.siteId)?.name) ?? "Unknown site"
                  return (
                    <Link
                      key={entry.dive.ref}
                      to="/import/review/computer/$ref"
                      params={{ ref: entry.dive.ref }}
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
                            mine={start.mine}
                            theirs={start.theirs}
                            name={name}
                            // Counted in the review's "differ" too.
                            warn={start.differs}
                          />
                          {differ.length > 0 && (
                            <Line
                              mine={differ.map((row) => row.mine).join(", ")}
                              theirs={differ
                                .map((row) => row.theirs)
                                .join(", ")}
                              name={name}
                              warn
                            />
                          )}
                        </span>
                      </span>
                      <IconChevronRight
                        aria-hidden
                        className="size-4.5 shrink-0 text-muted-foreground/60"
                      />
                    </Link>
                  )
                })}
              </ListCard>
            </ImportSection>
          )
        })}
      </div>
    </div>
  )
}

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
              <label htmlFor={id} className="flex flex-1 flex-col gap-0.5">
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
