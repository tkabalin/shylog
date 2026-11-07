import { useEffect, useRef } from "react"
import {
  IconArrowsDiff,
  IconCheck,
  IconChartAreaLine,
  IconNotebook,
  IconChevronRight,
} from "@tabler/icons-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { loadPending, useImport } from "@/data/import"
import { useLog } from "@/data/log"
import { computerName, differences } from "@/dive/form/values"
import { longDate } from "@/format/dates"
import { useImportCelebration } from "@/import/celebrate"
import { bigButton, SummaryRows } from "@/import/parts"
import { listRow, pressable } from "@/you/parts"

export const Route = createFileRoute("/import/done")({
  component: DonePage,
})

// ImportDoneHifi: what the import did, and the dives whose values differ
// from the computer's, each opening its detail, where the banner leads to
// the form's ✓ and ✕.
function DonePage() {
  const { loaded, lastImport } = useImport()
  const badge = useRef<HTMLSpanElement>(null)
  const celebrating = useImportCelebration(badge)
  const { log } = useLog()

  useEffect(() => {
    // The summary is the server's last import, so a reload shows it too.
    loadPending().catch(() => {})
  }, [])

  if (!loaded || !lastImport) return null
  const name = computerName(lastImport.file?.computerModel ?? null)
  const profiled = lastImport.paired + lastImport.added + lastImport.included
  // As the dive's banner counts them: the server flags any difference, but
  // a hand 16.2 m against the computer's 16.15 reads the same. Dives deleted
  // since, or not synced yet, are left out.
  const differing = lastImport.differing
    .map((id) => log?.dive.get(id))
    .filter(
      (dive) =>
        dive &&
        !dive.deletedAt &&
        differences(dive, log?.fieldMeta.get(dive.id)).length > 0
    )

  return (
    <div className="flex min-h-full flex-col md:mx-auto md:w-full md:max-w-xl">
      <div className="flex flex-1 flex-col gap-7 px-4 pt-[calc(4.5rem+env(safe-area-inset-top))] pb-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            ref={badge}
            aria-hidden
            className={cn(
              "inline-flex size-15 items-center justify-center rounded-full bg-primary/12 text-primary",
              celebrating &&
                "animate-in duration-300 ease-out fade-in-0 zoom-in-90 motion-reduce:zoom-in-100"
            )}
          >
            <IconCheck className="size-7 stroke-[1.9]" />
          </span>
          <h1 className="mt-1 text-2xl leading-[30px] font-semibold tracking-[-0.025em]">
            Import complete
          </h1>
          <p className="flex items-center gap-1.5 text-[15px] leading-normal text-muted-foreground tabular-nums">
            <IconChartAreaLine aria-hidden className="size-[1.15em] shrink-0" />
            {profiled === 1
              ? `1 dive now has its ${name} profile.`
              : `${profiled} dives now have their ${name} profile.`}
          </p>
        </div>
        <Card className="gap-0 py-0">
          <SummaryRows summary={lastImport} tall />
        </Card>
        {differing.length > 0 && (
          <Card className="gap-0 divide-y py-0">
            <div className="flex items-center gap-3 py-3.5 pr-3 pl-4">
              <IconArrowsDiff
                aria-hidden
                className="size-4.5 shrink-0 text-warn"
              />
              <span className="flex flex-1 flex-col gap-px">
                <span className="text-[15px]">
                  {differing.length}{" "}
                  {differing.length === 1 ? "dive differs" : "dives differ"}{" "}
                  from the {name}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  Your values were kept. Review them on each dive.
                </span>
              </span>
            </div>
            {differing.map((dive) => (
              <Link
                key={dive!.id}
                to="/dive/$diveId"
                params={{ diveId: dive!.id }}
                state={{ pushed: true }}
                className={cn(listRow, pressable)}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate">
                    {log?.sites.get(dive!.siteId)?.name ?? "Unknown site"}
                  </span>
                  <span className="text-[13px] text-muted-foreground tabular-nums">
                    {longDate(dive!.startTime)}
                  </span>
                </span>
                <IconChevronRight
                  aria-hidden
                  className="size-4.5 shrink-0 text-muted-foreground/60"
                />
              </Link>
            ))}
          </Card>
        )}
      </div>
      <div className="flex flex-col gap-2 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <Button
          className={bigButton}
          nativeButton={false}
          render={<Link to="/" replace />}
        >
          <IconNotebook aria-hidden data-icon="inline-start" />
          View in log
        </Button>
        <Button
          variant="ghost"
          className={cn(bigButton, "text-primary")}
          nativeButton={false}
          render={<Link to="/import" replace />}
        >
          Done
        </Button>
      </div>
    </div>
  )
}
