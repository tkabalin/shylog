import { useState } from "react"
import {
  IconArrowBarToDown,
  IconHourglass,
  IconTrash,
} from "@tabler/icons-react"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { cn } from "cn"

import { countText } from "@/components/pickers/match"
import { Sparkline } from "@/components/sparkline"
import type { Dive } from "@/data/db"
import { useLog, type LogView } from "@/data/log"
import { profileMaxDepth } from "@/dive/figures"
import { restore } from "@/dive/restore"
import { deletedGroup, longDate } from "@/format/dates"
import { depth, minutes } from "@/format/figures"
import { PageBar } from "@/you/bar"

export const Route = createFileRoute("/you/deleted")({
  component: DeletedPage,
})

// RecentlyDeletedHifi: deleted dives, most recently deleted first, grouped
// by when, each opened or restored from its card.
function DeletedPage() {
  const { log, loaded } = useLog()
  // Restored dives stay on as they were until their card has folded away.
  const [leaving, setLeaving] = useState<Dive[]>([])
  // 50 at a time, so a long list never renders every card and sparkline.
  const [shown, setShown] = useState(50)
  if (!loaded) return null
  const deleted = log
    ? [
        ...[...log.dive.values()].filter((dive) => dive.deletedAt),
        ...leaving.filter((dive) => !log.dive.get(dive.id)?.deletedAt),
      ].sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!))
    : []
  const groups = new Map<string, Dive[]>()
  for (const dive of deleted.slice(0, shown)) {
    const group = deletedGroup(dive.deletedAt!)
    groups.set(group, [...(groups.get(group) ?? []), dive])
  }
  return (
    <div className="flex min-h-full flex-col">
      <PageBar back={{ label: "You", to: "/you" }} title="Recently deleted" />
      {/* Nothing until the first sync has filled the log, so a fresh
          phone doesn't say nothing was deleted. */}
      {!log ? null : deleted.length ? (
        <div className="flex flex-col gap-5 px-4 pt-2 pb-10 md:mx-auto md:w-full md:max-w-xl">
          <p className="px-1 text-sm leading-normal text-muted-foreground">
            Deleted dives still stop the same computer dive being imported
            again.
          </p>
          {[...groups].map(([group, dives]) => (
            <section
              key={group}
              aria-labelledby={`group-${group.replace(/\W+/g, "-")}`}
              className="flex flex-col gap-2"
            >
              <h2
                id={`group-${group.replace(/\W+/g, "-")}`}
                className="px-1 text-[13px] font-semibold text-muted-foreground"
              >
                {group}
              </h2>
              {dives.map((dive) => (
                <DeletedCard
                  key={dive.id}
                  dive={dive}
                  log={log}
                  gone={!log.dive.get(dive.id)?.deletedAt}
                  onRestore={(restoring) =>
                    setLeaving((was) =>
                      restoring
                        ? [...was, dive]
                        : was.filter((one) => one.id !== dive.id)
                    )
                  }
                />
              ))}
            </section>
          ))}
          {deleted.length > shown && (
            <button
              type="button"
              onClick={() => setShown((was) => was + 50)}
              className="inline-flex h-11 items-center self-center px-4 text-[15px] font-medium text-primary transition-opacity duration-150 select-none hover:opacity-70 active:opacity-50 active:duration-0"
            >
              {countText(Math.min(50, deleted.length - shown))} more
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-10 pb-30 text-center">
          <span
            aria-hidden
            className="inline-flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <IconTrash className="size-6" />
          </span>
          <p className="mt-1 text-[17px] font-semibold tracking-[-0.015em]">
            Nothing deleted
          </p>
          <p className="text-sm leading-normal text-muted-foreground">
            Dives you delete show up here, and you can restore them any time.
          </p>
        </div>
      )}
    </div>
  )
}

function DeletedCard({
  dive,
  log,
  gone,
  onRestore,
}: {
  dive: Dive
  log: LogView
  // Restored, and folding away.
  gone: boolean
  onRestore: (restoring: boolean) => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const site = log.sites.get(dive.siteId)?.name
  const day = longDate(dive.startTime)
  const open = {
    to: "/dive/$diveId",
    params: { diveId: dive.id },
    state: { fromDeleted: true, pushed: true },
  } as const
  return (
    // A restored card folds away, margin and all, rather than the list
    // snapping shut under the thumb.
    <div
      inert={gone}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && gone) onRestore(false)
      }}
      className={cn(
        "grid grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity,margin] duration-200 ease-out motion-reduce:transition-opacity",
        gone && "-mt-2 grid-rows-[0fr] opacity-0"
      )}
    >
      {/* Room for the card's ring, which the fold would otherwise clip. */}
      <div className="-m-px min-h-0 overflow-hidden p-px">
        <div className="flex items-center gap-3 rounded-[14px] bg-card py-3.5 pr-3 pl-4 ring-1 ring-foreground/10">
          <Link
            {...open}
            aria-label={`${site}, ${day}. Open`}
            className="grid min-w-0 flex-1 grid-cols-1 items-center gap-x-3.5 select-none [-webkit-touch-callout:none] min-[390px]:grid-cols-[minmax(0,1fr)_5rem]"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              {/* Two lines, so sites that start alike can be told apart. */}
              <span className="line-clamp-2 text-base font-medium tracking-[-0.015em] [overflow-wrap:anywhere]">
                {site}
              </span>
              <span className="truncate text-[13px] text-muted-foreground tabular-nums">
                {day}
              </span>
              <span className="mt-0.5 flex items-center gap-2.5 text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
                <span className="inline-flex items-center gap-1">
                  <IconArrowBarToDown
                    role="img"
                    aria-label="Max depth"
                    className="size-3.25"
                  />
                  {depth(dive.maxDepth)} m
                </span>
                <span className="inline-flex items-center gap-1">
                  <IconHourglass
                    role="img"
                    aria-label="Duration"
                    className="size-3.25"
                  />
                  {minutes(dive.duration)} min
                </span>
              </span>
            </span>
            {/* Faint, as the board draws it: these dives are out of the log. */}
            <span className="hidden min-[390px]:block">
              {dive.sparkline && (
                <Sparkline
                  points={dive.sparkline}
                  maxDepth={profileMaxDepth(dive, log.fieldMeta.get(dive.id))}
                  stretch
                  className="w-full text-muted-foreground/50"
                />
              )}
            </span>
          </Link>
          <button
            type="button"
            disabled={busy}
            aria-label={`Restore ${site}, ${day}`}
            onClick={async () => {
              setBusy(true)
              onRestore(true)
              // The card folds away once the log has the dive back.
              const back = await restore(dive.id, site, () =>
                // Over the list, so Back says Deleted and returns to it.
                router.navigate(open)
              )
              setBusy(false)
              if (!back) onRestore(false)
            }}
            className="relative inline-flex h-9 shrink-0 items-center rounded-full bg-primary/12 px-3.5 text-sm font-medium text-primary transition-opacity duration-150 select-none after:absolute after:inset-x-0 after:-inset-y-1 hover:opacity-70 active:opacity-50 active:duration-0 disabled:opacity-50"
          >
            Restore
          </button>
        </div>
      </div>
    </div>
  )
}
