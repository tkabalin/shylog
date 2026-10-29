import { useState } from "react"
import { normaliseName, type EntityKind } from "@shylog/core"
import { IconAlertTriangle } from "@tabler/icons-react"
import { cn } from "cn"

import { countText, Highlighted, matchName } from "@/components/pickers/match"
import { SheetSearch } from "@/components/pickers/sheet"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { mergeEntity } from "@/data/entities"
import { useDesk } from "@/hooks/use-desk"

import { kindLabels } from "./kinds"

export interface Candidate {
  id: string
  name: string
  // A site's region or a trip's dates, before the count.
  place?: string
  // What moves with it: dives, or a region's sites.
  count: number
  unit: [string, string]
  likely: boolean
}

// EntityDetailHifi's merge sheet: pick the duplicate, see what moves, and
// merge it into the entity on screen, which keeps its name.
export function MergeSheet({
  open,
  onOpenChange,
  kind,
  into,
  candidates,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: EntityKind
  into: { id: string; name: string }
  candidates: Candidate[]
}) {
  const desk = useDesk()
  const [query, setQuery] = useState("")
  const [chosen, setChosen] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const label = kindLabels[kind]
  const key = normaliseName(query)
  const shown = candidates
    .map((candidate) => ({
      candidate,
      match: matchName(candidate.name, query),
    }))
    .filter(({ match }) => !key || match)
    // Likely duplicates first, then the most used.
    .sort(
      (a, b) =>
        Number(b.candidate.likely) - Number(a.candidate.likely) ||
        b.candidate.count - a.candidate.count ||
        a.candidate.name.localeCompare(b.candidate.name)
    )
  const pick = candidates.find((candidate) => candidate.id === chosen)

  const reset = () => {
    setQuery("")
    setChosen(undefined)
    setError(undefined)
  }
  const change = (next: boolean) => {
    if (busy) return
    if (!next) reset()
    onOpenChange(next)
  }
  const merge = async () => {
    if (!pick) return
    setBusy(true)
    setError(undefined)
    try {
      await mergeEntity(kind, pick.id, into.id)
      setBusy(false)
      reset()
      onOpenChange(false)
    } catch (failure) {
      setBusy(false)
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  const line = pick
    ? `${countText(pick.count)} ${pick.count === 1 ? pick.unit[0] : pick.unit[1]} ${pick.count === 1 ? "moves" : "move"} to ${into.name} and “${pick.name}” is removed. This can’t be undone.`
    : ""
  const cta = pick ? `Merge “${pick.name}”` : "Merge"

  return (
    <Drawer showSwipeHandle open={open} onOpenChange={change}>
      <DrawerContent className="max-h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)]">
        <DrawerHeader className="pb-3 desk:pb-2">
          <DrawerTitle className="[overflow-wrap:anywhere]">
            Merge into {into.name}
          </DrawerTitle>
          <DrawerDescription>
            Pick the duplicate. Its {kind === "region" ? "sites" : "dives"} move
            here and it’s removed.
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] desk:pb-0">
          <SheetSearch
            value={query}
            onChange={setQuery}
            label={`Search ${label.title.toLowerCase()}`}
          />
          <div
            role="radiogroup"
            aria-label="Duplicate to merge"
            className="flex min-h-0 flex-col divide-y overflow-y-auto overscroll-contain rounded-xl bg-card ring-1 ring-foreground/10 desk:max-h-72"
          >
            {shown.length ? (
              shown.map(({ candidate, match }) => (
                <button
                  key={candidate.id}
                  type="button"
                  role="radio"
                  aria-checked={candidate.id === chosen}
                  onClick={() => {
                    setChosen(candidate.id)
                    // A refusal was about the one picked before.
                    setError(undefined)
                  }}
                  className="flex min-h-14 shrink-0 items-center gap-3 px-4 py-2 text-left transition-colors duration-150 select-none hover:bg-muted/60 active:bg-muted active:duration-0"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "inline-flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-muted-foreground/50",
                      candidate.id === chosen && "border-primary"
                    )}
                  >
                    <span
                      className={cn(
                        "size-2.5 rounded-full bg-primary opacity-0 transition-opacity duration-150",
                        candidate.id === chosen && "opacity-100"
                      )}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[15px] font-medium">
                      {match ? (
                        <Highlighted parts={match.parts} />
                      ) : (
                        candidate.name
                      )}
                    </span>
                    {/* The count never truncates: it's what merging moves. */}
                    <span className="flex min-w-0 gap-1 text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
                      {candidate.place && (
                        <span className="truncate">{candidate.place} ·</span>
                      )}
                      <span className="shrink-0">
                        {countText(candidate.count)}{" "}
                        {candidate.count === 1
                          ? candidate.unit[0]
                          : candidate.unit[1]}
                      </span>
                    </span>
                    {candidate.likely && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 dark:text-orange-400">
                        <IconAlertTriangle
                          aria-hidden
                          className="size-3.5 shrink-0"
                        />
                        Likely duplicate
                      </span>
                    )}
                  </span>
                </button>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {key
                  ? `No ${label.title.toLowerCase()} match.`
                  : `No other ${label.one} can be merged into this one.`}
              </p>
            )}
          </div>
          {/* Two lines held, so picking doesn't grow the sheet under the
              finger; it says what to do until one is picked. A long name
              wraps anywhere rather than overflowing. */}
          <div className="min-h-10 px-1 text-[13px] leading-normal [overflow-wrap:anywhere] text-muted-foreground tabular-nums">
            <p className="line-clamp-3">
              {line || "Pick the one to merge into this."}
            </p>
            {/* Under the consequence, which stays for Try again. */}
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
          </div>
          {!desk && (
            <Button
              className="h-12 min-w-0 shrink-0 rounded-[14px] text-base font-semibold"
              disabled={!pick || busy}
              onClick={merge}
            >
              <span className="min-w-0 truncate">
                {error ? "Try again" : cta}
              </span>
            </Button>
          )}
        </div>
        {desk && (
          <DrawerFooter>
            <Button variant="outline" onClick={() => change(false)}>
              Cancel
            </Button>
            <Button
              className="min-w-0 shrink"
              disabled={!pick || busy}
              onClick={merge}
            >
              <span className="min-w-0 truncate">
                {error ? "Try again" : cta}
              </span>
            </Button>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  )
}
