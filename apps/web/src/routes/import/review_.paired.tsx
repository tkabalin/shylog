import { useEffect } from "react"
import {
  IconChevronRight,
  IconClockEdit,
  IconDeviceWatch,
} from "@tabler/icons-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { cn } from "cn"

import { loadPending, useImport } from "@/data/import"
import { useLog } from "@/data/log"
import { computerName } from "@/dive/form/values"
import { longDate } from "@/format/dates"
import { compareRows } from "@/import/compare"
import { useToReview } from "@/import/pairing"
import { ImportSection, ListCard } from "@/import/parts"
import { capital, offsetText, review } from "@/import/review"
import { PageBar } from "@/you/bar"
import { listRow, pressable } from "@/you/parts"

export const Route = createFileRoute("/import/review_/paired")({
  component: PairedPage,
})

// PairedHifi: every pair by day, your start beside the computer's, and the
// values that differ, each opening its pairing.
function PairedPage() {
  const { loaded, preview, overrides } = useImport()
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
          {paired.length
            ? `Your values stay. Your ${name} adds its profile.`
            : "No dives are paired."}
        </p>
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
                  const rows = compareRows(entry.dive, hand)
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
                        <Line
                          mine={start.mine}
                          theirs={start.theirs}
                          name={name}
                        />
                        {differ.length > 0 && (
                          <Line
                            mine={differ.map((row) => row.mine).join(", ")}
                            theirs={differ.map((row) => row.theirs).join(", ")}
                            name={name}
                            warn
                          />
                        )}
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

// Yours, then the computer's beside its watch icon, which starts halfway
// across on every line, so the computer's values read as one column.
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
    <span className="grid grid-cols-2 items-center gap-2 text-[13px] text-muted-foreground tabular-nums">
      <span className="truncate">
        <span className="sr-only">Yours: </span>
        {mine}
      </span>
      <span className="flex min-w-0 items-center">
        <IconDeviceWatch aria-hidden className="mr-1 size-[1.15em] shrink-0" />
        <span className={cn("truncate", warn && "text-warn")}>
          <span className="sr-only">{name}: </span>
          {theirs}
        </span>
      </span>
    </span>
  )
}
