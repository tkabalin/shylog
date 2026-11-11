import { useEffect, useState, type ReactNode } from "react"
import {
  IconArrowsDiff,
  IconChevronDown,
  IconChevronRight,
  IconDeviceWatch,
  IconNotebook,
  IconPlayerSkipForward,
  IconPlugConnected,
  IconHistory,
  IconSwimming,
  IconUpload,
  type Icon,
} from "@tabler/icons-react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { cn } from "cn"

import { BarButton } from "@/components/pickers/sheet"
import { Button } from "@/components/ui/button"
import {
  AppliedSome,
  applyReview,
  discardPreview,
  loadPending,
  setOverrides,
  useImport,
} from "@/data/import"
import { useLog } from "@/data/log"
import { headingButton, pressedButton, Reveal } from "@/dive/form/rows"
import { computerName } from "@/dive/form/values"
import { clockTime, longDate } from "@/format/dates"
import { depth, minutes } from "@/format/figures"
import { useDesk } from "@/hooks/use-desk"
import { celebrateImport } from "@/import/celebrate"
import { ClockSheet } from "@/import/clock-sheet"
import { compareRows, withAdopted } from "@/import/compare"
import {
  bigButton,
  dayAndTime,
  Figures,
  ImportSection,
  ListCard,
  RoundCheck,
  shortDay,
  shortLength,
  unsupportedGas,
} from "@/import/parts"
import {
  capital,
  choose,
  firstDayToCheck,
  gapText,
  leftOutLabels,
  review,
  type Entry,
} from "@/import/review"
import { ConfirmSheet } from "@/import/sheets"
import { listRow, pressable, RowContent } from "@/you/parts"
import { PageBar } from "@/you/bar"

export const Route = createFileRoute("/import/review")({
  component: ReviewPage,
})

// ImportReviewHifi: hand-logged dives no computer dive pairs with, the new
// dives to add, then the paired, already imported and left-out dives, and
// the button that applies it all.
function ReviewPage() {
  const { loaded, preview, overrides, adopt } = useImport()
  const { log } = useLog()
  const navigate = useNavigate()
  const desk = useDesk()
  const [clockDate, setClockDate] = useState<string | null>(null)
  const [clockOpen, setClockOpen] = useState(false)
  const [leftOutOpen, setLeftOutOpen] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [changed, setChanged] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  // Discard's own, so the sheet never shows a failed apply's error.
  const [discardError, setDiscardError] = useState<string>()
  // A chunk failed after others were applied, which Discard doesn't undo.
  const [appliedSome, setAppliedSome] = useState(false)

  useEffect(() => {
    if (!loaded) loadPending().catch(() => {})
  }, [loaded])
  useEffect(() => {
    // Applied or discarded elsewhere, or expired: back to the upload.
    if (loaded && !preview && !busy)
      void navigate({ to: "/import", replace: true })
  }, [loaded, preview, busy, navigate])

  if (!preview || !log) return null
  const name = computerName(preview.computerModel)
  const hands = log.dive
  const siteOf = (diveId: string) => {
    const dive = hands.get(diveId)
    return (dive && log.sites.get(dive.siteId)?.name) ?? "Unknown site"
  }
  const current = review(preview, overrides, hands)
  const { counts } = current
  // As the import will leave them, once the values to take are taken.
  const differing = current.paired.filter(({ entry, diveId }) =>
    withAdopted(compareRows(entry.dive, hands.get(diveId)), adopt).some(
      (row) => row.differs
    )
  ).length
  const moved = preview.days.filter((day) => day.offset !== 0)
  const allAdded = current.newDives.every(({ added }) => added)

  const apply = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const outcome = await applyReview()
      if (outcome.status === "applied") {
        celebrateImport()
        await navigate({ to: "/import/done", replace: true })
        return
      }
      setChanged(outcome.diveIds)
    } catch (failure) {
      if (failure instanceof AppliedSome) {
        setAppliedSome(true)
        const { paired, added, included } = failure.applied
        const done = paired + added + included
        setError(
          `${failure.message}. ${done === 1 ? "1 dive was" : `${done} dives were`} imported before it stopped.`
        )
      } else
        setError(failure instanceof Error ? failure.message : String(failure))
    }
    setBusy(false)
  }

  const openClock = (date: string | null) => {
    setClockDate(date)
    setClockOpen(true)
  }

  const discard = async () => {
    setBusy(true)
    setDiscardError(undefined)
    try {
      await discardPreview()
      await navigate({ to: "/import", replace: true })
    } catch (failure) {
      setDiscardError(
        failure instanceof Error ? failure.message : String(failure)
      )
      setBusy(false)
    }
  }

  const openDiscard = () => {
    setDiscardError(undefined)
    setDiscarding(true)
  }

  const pairedRow = (
    <RowContent
      icon={IconPlugConnected}
      label="Paired"
      sub={
        <span className="flex items-center gap-1.5 truncate tabular-nums">
          {/* The Done screen's mark for dives that differ, so the two read
              as the same thing. */}
          {differing > 0 && (
            <IconArrowsDiff
              aria-hidden
              className="size-[1.15em] shrink-0 text-warn"
            />
          )}
          {differing
            ? `${differing} ${differing === 1 ? "differs" : "differ"} from the ${name}`
            : moved.length === 1
              ? `Clock moved ${shortDay(moved[0].date)}`
              : moved.length
                ? `Clock moved on ${moved.length} days`
                : counts.paired
                  ? "All matched"
                  : "None"}
        </span>
      }
      value={counts.paired}
      chevron={counts.paired > 0}
    />
  )

  const leftOutDays = new Map<string, typeof current.leftOut>()
  for (const item of current.leftOut) {
    const list = leftOutDays.get(item.entry.dive.day) ?? []
    list.push(item)
    leftOutDays.set(item.entry.dive.day, list)
  }
  const leftOutCount = current.leftOut.filter((item) => !item.included).length
  // A download that read every dive leaves out those before the last one too.
  const earlier = current.leftOut.filter(
    (item) => item.entry.reason === "earlier"
  ).length
  const leftOutKinds = !earlier
    ? "Freedives and false starts"
    : earlier === current.leftOut.length
      ? "From before your last download"
      : "Freedives, false starts and earlier dives"

  // A dive the log doesn't hold, not synced yet, has no day to name.
  const changedName = (id: string) => {
    const dive = hands.get(id)
    return dive ? `${siteOf(id)} on ${shortDay(dive.startTime)}` : "a dive"
  }
  const changedTitle = !changed?.length
    ? "This review changed"
    : changed.length === 1
      ? "1 dive changed since this preview"
      : `${changed.length} dives changed since this preview`
  const changedBody = !changed?.length
    ? "The preview was proposed again since these choices were made. Check it before importing."
    : changed.length === 1
      ? `${capital(changedName(changed[0]))} changed after this preview was made. Check its pairing before importing.`
      : `${capital(
          changed.slice(0, 3).map(changedName).join(", ")
        )}${changed.length > 3 ? ` and ${changed.length - 3} more` : ""} changed after this preview was made. Check their pairings before importing.`

  return (
    <div className="flex min-h-full flex-col">
      <PageBar
        back={{ label: "Import", to: "/import" }}
        title="Review"
        end={
          desk ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => openDiscard()}
            >
              Discard
            </Button>
          ) : (
            <BarButton disabled={busy} onClick={() => openDiscard()}>
              Discard
            </BarButton>
          )
        }
      />
      <div className="flex flex-1 flex-col gap-6 px-4 pt-2 pb-8 md:mx-auto md:w-full md:max-w-xl">
        {/* The import's main outcome, so it leads, with no heading: its row
            says what it is. Nothing to open with no pairs. */}
        <ListCard>
          {counts.paired ? (
            <Link
              to="/import/review/paired"
              state={{ pushed: true }}
              className={cn(listRow, pressable)}
            >
              {pairedRow}
            </Link>
          ) : (
            <div className={listRow}>{pairedRow}</div>
          )}
        </ListCard>

        {current.newDives.length > 0 && (
          <ImportSection
            title={<Origin icon={IconDeviceWatch}>New from your {name}</Origin>}
            aside={
              // As the dive picker's day links; one dive's own check does
              // the same.
              current.newDives.length > 1 && (
                <button
                  type="button"
                  // Adding or skipping touches no other dive's choice, so
                  // there's nothing for choose() to settle.
                  onClick={() =>
                    setOverrides({
                      ...overrides,
                      ...Object.fromEntries(
                        current.newDives.map(({ entry }) => [
                          entry.dive.ref,
                          { kind: allAdded ? "skip" : "add" } as const,
                        ])
                      ),
                    })
                  }
                  className={cn(headingButton, "-my-1.5")}
                >
                  {allAdded ? "Deselect all" : "Select all"}
                </button>
              )
            }
          >
            <ListCard>
              {current.newDives.map(({ entry, added }) => (
                <NewDiveRow
                  key={entry.dive.ref}
                  entry={entry}
                  added={added}
                  name={name}
                  onToggle={() =>
                    setOverrides(
                      choose(preview, overrides, entry.dive.ref, {
                        kind: added ? "skip" : "add",
                      })
                    )
                  }
                />
              ))}
            </ListCard>
          </ImportSection>
        )}

        {current.notPaired.length > 0 && (
          <ImportSection
            title={
              <Origin icon={IconNotebook}>Your dives with no match</Origin>
            }
          >
            <ListCard>
              {current.notPaired.map(({ diveId, gap }) => {
                const dive = hands.get(diveId)
                return (
                  <Link
                    key={diveId}
                    to="/import/review/dive/$diveId"
                    params={{ diveId }}
                    state={{ pushed: true }}
                    className={cn(listRow, pressable, "py-3")}
                  >
                    <RowContent
                      label={
                        <span className="truncate text-base font-medium tracking-[-0.015em]">
                          {siteOf(diveId)}
                        </span>
                      }
                      sub={
                        <span className="flex flex-col gap-0.5 tabular-nums">
                          {dive && (
                            <span>
                              {dayAndTime(dive.startTime)} ·{" "}
                              {depth(dive.maxDepth)} m ·{" "}
                              {Math.round(dive.duration / 60)} min
                            </span>
                          )}
                          <span>
                            {gap == null
                              ? `No ${name} dive that day`
                              : `${capital(name)} starts ${gapText(gap)} apart`}
                          </span>
                        </span>
                      }
                      chevron
                    />
                  </Link>
                )
              })}
            </ListCard>
            <p className="mt-2 px-1 text-[13px] leading-normal text-pretty text-muted-foreground">
              These stay in your log as you logged them. Tap one to pair it.
            </p>
          </ImportSection>
        )}

        {(preview.alreadyImported > 0 || current.leftOut.length > 0) && (
          <ImportSection
            title={
              // Set, if only to null, on a download alone.
              preview.earlierThan !== undefined
                ? "Also on the watch"
                : "Also in this file"
            }
          >
            <ListCard>
              {preview.alreadyImported > 0 && (
                <div className={listRow}>
                  <RowContent
                    icon={IconPlayerSkipForward}
                    label="Already imported"
                    sub="From earlier imports"
                    value={preview.alreadyImported}
                  />
                </div>
              )}
              {current.leftOut.length > 0 && (
                <>
                  <button
                    type="button"
                    aria-expanded={leftOutOpen}
                    onClick={() => setLeftOutOpen(!leftOutOpen)}
                    className={cn(listRow, pressable)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {earlier === current.leftOut.length ? (
                          <IconHistory
                            aria-hidden
                            className="size-[1.15em] shrink-0 text-muted-foreground"
                          />
                        ) : (
                          <IconSwimming
                            aria-hidden
                            className="size-[1.15em] shrink-0 text-muted-foreground"
                          />
                        )}
                        Left out
                      </span>
                      <span className="mt-0.5 block text-[13px] text-muted-foreground">
                        {leftOutKinds}
                      </span>
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {leftOutCount}
                    </span>
                    <IconChevronDown
                      aria-hidden
                      className={cn(
                        "size-4.5 shrink-0 text-muted-foreground/60 transition-transform duration-200 ease-out",
                        leftOutOpen && "rotate-180"
                      )}
                    />
                  </button>
                  {/* Eases open on the tap, as the form's revealed rows do,
                    rather than pushing the clock link down at once. */}
                  {leftOutOpen && (
                    <Reveal className="divide-y">
                      {[...leftOutDays].map(([day, items]) => (
                        <div key={day} className="flex flex-col pt-3 pb-1">
                          <span className="px-4 pb-0.5 text-[13px] font-semibold text-muted-foreground tabular-nums">
                            {shortDay(day)}
                          </span>
                          {items.map(({ entry, included }) => (
                            <LeftOutRow
                              key={entry.dive.ref}
                              entry={entry}
                              included={included}
                              onToggle={() =>
                                setOverrides(
                                  choose(preview, overrides, entry.dive.ref, {
                                    kind: included ? "skip" : "add",
                                  })
                                )
                              }
                            />
                          ))}
                        </div>
                      ))}
                    </Reveal>
                  )}
                </>
              )}
            </ListCard>
          </ImportSection>
        )}
        {/* No day to shift when every dive was imported before. */}
        {preview.days.length > 0 && (
          <p className="-mt-2 px-1 text-[13px] leading-normal text-muted-foreground">
            Times off by an hour or more?{" "}
            <button
              type="button"
              onClick={() => openClock(firstDayToCheck(preview, current))}
              className={cn(
                "relative font-medium text-primary after:absolute after:-inset-y-3",
                pressedButton
              )}
            >
              Adjust the {name} clock
            </button>
          </p>
        )}
      </div>

      <div className="sticky bottom-0 z-10 flex flex-col gap-2.5 border-t bg-background px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-[calc(max(0rem,(100%-36rem)/2)+1rem)]">
        <span className="text-center text-[13px] text-muted-foreground tabular-nums">
          {counts.paired} paired · {counts.added + counts.included} new
          {counts.skipped > 0 && ` · ${counts.skipped} skipped`}
          {current.notPaired.length > 0 &&
            ` · ${current.notPaired.length} unchanged`}
        </span>
        {error && (
          <p role="alert" className="text-center text-[13px] text-destructive">
            {error}
          </p>
        )}
        {/* Importing… is read, so it keeps the button's full contrast. */}
        <Button
          className={cn(bigButton, busy && "disabled:opacity-100")}
          disabled={busy}
          onClick={apply}
        >
          {!busy && <IconUpload aria-hidden data-icon="inline-start" />}
          {busy
            ? "Importing…"
            : error
              ? "Try again"
              : counts.total
                ? `Import ${counts.total} ${counts.total === 1 ? "dive" : "dives"}`
                : "Finish import"}
        </Button>
      </div>

      <ClockSheet
        open={clockOpen}
        onOpenChange={setClockOpen}
        // A day from the start, so the sheet mounts closed and its first
        // open slides in rather than appearing.
        date={clockDate ?? preview.days.at(-1)?.date ?? null}
        onDateChange={setClockDate}
        computer={name}
      />
      <ConfirmSheet
        open={discarding}
        onOpenChange={setDiscarding}
        title="Discard this import?"
        body={
          appliedSome
            ? "The dives imported before it stopped stay in your log. You can choose the file again later."
            : "Nothing from it has been imported. You can choose the file again later."
        }
        confirm="Discard import"
        cancel="Keep reviewing"
        destructive
        busy={busy}
        error={discardError}
        onConfirm={discard}
        onCancel={() => setDiscarding(false)}
      />
      <ConfirmSheet
        open={changed != null}
        onOpenChange={(open) => !open && setChanged(null)}
        title={changedTitle}
        body={changedBody}
        confirm={changed?.length === 1 ? "Check it" : "Check the review"}
        cancel="Import anyway"
        busy={busy}
        onConfirm={() => {
          const one = changed?.length === 1 ? changed[0] : null
          setChanged(null)
          if (one && hands.get(one) && !hands.get(one)!.deletedAt)
            void navigate({
              to: "/import/review/dive/$diveId",
              params: { diveId: one },
              state: { pushed: true },
            })
        }}
        onCancel={() => {
          setChanged(null)
          void apply()
        }}
      />
    </div>
  )
}

// A heading that says where its dives come from: the file, or the log.
function Origin({ icon: Icon, children }: { icon: Icon; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon aria-hidden className="size-[1.15em] shrink-0" />
      {children}
    </span>
  )
}

function NewDiveRow({
  entry,
  added,
  name,
  onToggle,
}: {
  entry: Entry
  added: boolean
  name: string
  onToggle: () => void
}) {
  const { dive } = entry
  const when = dayAndTime(dive.startTime)
  return (
    // The link spans the row under the check, so the whole row darkens
    // when it's hovered or pressed; the check keeps its own fade.
    <div className="relative">
      <button
        type="button"
        role="checkbox"
        aria-checked={added}
        aria-label={`Add the ${name} dive on ${when} as a new dive`}
        onClick={onToggle}
        className={cn(
          "absolute inset-y-0 left-0 z-10 flex w-12 items-center justify-center pl-1",
          pressedButton
        )}
      >
        <RoundCheck on={added} />
      </button>
      <Link
        to="/import/review/computer/$ref"
        params={{ ref: dive.ref }}
        state={{ pushed: true }}
        className={cn(listRow, pressable, "min-h-14 pl-12")}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              "truncate text-base font-medium tracking-[-0.015em] tabular-nums",
              !added && "text-muted-foreground"
            )}
          >
            {dive.site ? `${dive.site} · ${clockTime(dive.startTime)}` : when}
          </span>
          <span className="text-[13px] text-muted-foreground tabular-nums">
            <Figures dive={dive} />
          </span>
          {dive.unsupportedGas && (
            <span className="text-[13px] text-warn">{unsupportedGas}</span>
          )}
        </span>
        <IconChevronRight
          aria-hidden
          className="size-4.5 shrink-0 text-muted-foreground/60"
        />
      </Link>
    </div>
  )
}

function LeftOutRow({
  entry,
  included,
  onToggle,
}: {
  entry: Entry
  included: boolean
  onToggle: () => void
}) {
  const { dive, reason } = entry
  const time = clockTime(dive.startTime)
  return (
    <div className="flex min-h-11 items-center gap-3 pr-3 pl-4 text-[15px] tabular-nums">
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          !included && "text-muted-foreground"
        )}
      >
        {time} · {depth(dive.maxDepth)} m ·{" "}
        {reason === "earlier"
          ? `${minutes(dive.duration)} min`
          : shortLength(dive.duration)}
        <span className="text-muted-foreground">
          {" "}
          · {leftOutLabels[reason!]}
        </span>
      </span>
      <button
        type="button"
        aria-pressed={included}
        aria-label={`Include the ${reason === "freedive" ? "freedive" : "dive"} at ${time} on ${longDate(dive.day)}`}
        onClick={onToggle}
        className={cn(
          "relative h-7.5 shrink-0 rounded-full px-3 text-[13px] font-medium transition-colors duration-150 after:absolute after:-inset-y-2 active:opacity-70 active:duration-0",
          included ? "bg-primary/12 text-primary" : "bg-muted"
        )}
      >
        {included ? "Included" : "Include"}
      </button>
    </div>
  )
}
