import { memo, useCallback, useMemo, useState } from "react"
import { normaliseName, type DiveRole, type DiveSetKind } from "@shylog/core"
import {
  IconArrowBarToDown,
  IconCheck,
  IconClock,
  IconClockPlay,
} from "@tabler/icons-react"
import { cn } from "cn"

import { countText } from "@/components/pickers/match"
import {
  BarButton,
  FullSheetContent,
  SheetBar,
  SheetSearch,
} from "@/components/pickers/sheet"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import type { Dive } from "@/data/db"
import type { Picked } from "@/data/entities"
import type { LogView } from "@/data/log"
import { Row, Segmented, type Icon } from "@/dive/form/rows"
import {
  cardDay,
  clockTime,
  monthKey,
  monthLabel,
  months,
} from "@/format/dates"
import { depth, minutes } from "@/format/figures"
import { useDesk } from "@/hooks/use-desk"

import { kindLabels } from "./kinds"

const roleOptions = [
  { value: "buddy", label: "Buddy" },
  { value: "professional", label: "Pro" },
] satisfies { value: DiveRole; label: string }[]

// A day's dives under its heading, the days under their month's, as the
// Log groups them.
function grouped(dives: Dive[]) {
  const groups: { key: string; label: string; days: Dive[][] }[] = []
  for (const dive of dives) {
    const month = monthKey(dive.startTime)
    let group = groups.at(-1)
    if (group?.key !== month) {
      group = { key: month, label: monthLabel(dive.startTime), days: [] }
      groups.push(group)
    }
    const day = group.days.at(-1)
    if (day?.[0].startTime.slice(0, 10) === dive.startTime.slice(0, 10)) {
      day.push(dive)
    } else group.days.push([dive])
  }
  return groups
}

// The role a person has on most of their dives, so ticking more of them
// starts from it.
function usualRole(picked: Picked): DiveRole {
  const pros = [...picked.values()].filter((r) => r === "professional").length
  return pros > picked.size / 2 ? "professional" : "buddy"
}

const sameTicks = (a: Picked, b: Picked) =>
  a.size === b.size && [...a].every(([id, role]) => b.get(id) === role)

// The full-height sheet that ticks the dives a trip, dive centre or person
// is on. Its own copy of the ticks is taken each time it opens, so Cancel
// leaves the screen's as they were, and Save is worked out against that
// copy, so a sync while it's open can't untick a dive the diver never saw.
export function DivePicker({
  open,
  onOpenChange,
  log,
  kind,
  entityId,
  name,
  picked,
  action,
  onConfirm,
  emptyConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  log: LogView
  kind: DiveSetKind
  // Null for one not saved yet.
  entityId: string | null
  name: string
  picked: Picked
  // Done hands the ticks back to a form; Save sends them.
  action: "Done" | "Save"
  onConfirm: (
    ticked: Picked,
    opened: Picked,
    deleteIfEmpty: boolean
  ) => Promise<void> | void
  // Asked before saving with every dive unticked, when that deletes it.
  emptyConfirm?: { title: string; description: string; action: string }
}) {
  const desk = useDesk()
  const [opened, setOpened] = useState(picked)
  const [ticked, setTicked] = useState(picked)
  const [query, setQuery] = useState("")
  const [role, setRole] = useState<DiveRole>("buddy")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string>()
  // Fresh ticks each time it opens.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setOpened(picked)
      setTicked(new Map(picked))
      setQuery("")
      setRole(usualRole(picked))
      setError(undefined)
    }
  }
  const changed = !sameTicks(opened, ticked)

  // Drafts aren't on the server yet, so no request can name them.
  const dives = useMemo(() => log.dives.filter((dive) => !dive.draft), [log])
  const drafts = log.dives.length > dives.length
  const key = normaliseName(query)
  const groups = useMemo(
    () =>
      grouped(
        key
          ? dives.filter((dive) =>
              normaliseName(log.sites.get(dive.siteId)?.name ?? "").includes(
                key
              )
            )
          : dives
      ),
    [dives, key, log]
  )

  // The same handler across ticks, so only the rows that change re-render;
  // a new role makes a new one, which is rare.
  const tick = useCallback(
    (ids: string[], on: boolean) => {
      setTicked((was) => {
        const next = new Map(was)
        for (const id of ids) {
          // A dive already ticked keeps its role.
          if (!on) next.delete(id)
          else if (!next.has(id)) next.set(id, kind === "person" ? role : null)
        }
        return next
      })
      setError(undefined)
    },
    [kind, role]
  )

  // The trip or dive centre a dive is in now, when it's another one.
  const elsewhere = (dive: Dive) => {
    if (kind === "person") return undefined
    const other = kind === "trip" ? dive.tripId : dive.diveCentreId
    if (!other || other === entityId) return undefined
    return (kind === "trip" ? log.trips : log.diveCentres).get(other)?.name
  }

  const confirm = async (deleteIfEmpty: boolean) => {
    setBusy(true)
    setError(undefined)
    setConfirmError(undefined)
    try {
      await onConfirm(ticked, opened, deleteIfEmpty)
      setConfirming(false)
      onOpenChange(false)
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : String(failure)
      // By the button that was tapped, as Delete's own sheet keeps it.
      if (deleteIfEmpty) setConfirmError(message)
      else setError(message)
    } finally {
      setBusy(false)
    }
  }
  const finish = () => {
    if (!changed) onOpenChange(false)
    else if (!ticked.size && emptyConfirm) {
      setConfirmError(undefined)
      setConfirming(true)
    } else void confirm(false)
  }

  const count = ticked.size
  const title = count
    ? `${countText(count)} ${count === 1 ? "dive" : "dives"}`
    : "Choose dives"
  const KindIcon = kindLabels[kind].icon

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(next) => {
          // Ticks are work: once there are changes a swipe, a tap outside or
          // Escape doesn't throw them away, only Cancel does.
          if (next || busy || changed) return
          onOpenChange(false)
        }}
      >
        <FullSheetContent>
          <SheetBar
            title={<span className="tabular-nums">{title}</span>}
            start={
              <BarButton disabled={busy} onClick={() => onOpenChange(false)}>
                Cancel
              </BarButton>
            }
            end={
              <BarButton strong disabled={busy} onClick={finish}>
                {busy ? "Saving…" : action}
              </BarButton>
            }
          />
          <div className="flex shrink-0 flex-col gap-1 px-4 pt-1 pb-2">
            <SheetSearch
              value={query}
              onChange={setQuery}
              label="Search sites"
            />
            {kind === "person" && (
              <Row className="-mx-4 py-1.5">
                {/* Its own span rather than a form Label, so a long name
                    gives way to the switch instead of pushing it off. */}
                <span
                  id="picker-role"
                  className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
                >
                  {name ? `Add ${name} as` : "Add as"}
                </span>
                <Segmented
                  labelledBy="picker-role"
                  className="w-auto"
                  value={role}
                  onChange={(next) => next && setRole(next)}
                  options={roleOptions}
                />
              </Row>
            )}
            {error && (
              <p role="alert" className="px-1 text-[13px] text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom),var(--keyboard,0px))]">
            {groups.length === 0 && (
              <p className="px-1 pt-6 text-center text-[15px] text-muted-foreground">
                {key ? "No dives at a site by that name." : "No dives yet."}
              </p>
            )}
            {groups.map((group) => (
              <section
                key={group.key}
                aria-label={group.label}
                className="flex flex-col"
              >
                <h3 className="mx-1 mt-3 mb-0.5 text-[15px] font-semibold tracking-[-0.01em]">
                  {group.label}
                </h3>
                {group.days.map((day) => {
                  const ids = day.map((dive) => dive.id)
                  const all = ids.every((id) => ticked.has(id))
                  const label = `${cardDay(day[0].startTime)} ${months[Number(day[0].startTime.slice(5, 7)) - 1]}`
                  return (
                    <div key={ids[0]} className="mb-2 flex flex-col">
                      <div className="flex h-8 items-center justify-between px-1">
                        <span className="text-[13px] font-semibold text-muted-foreground">
                          {label}
                        </span>
                        {/* A one-dive day's row does the same, so only
                            days with more get the link. */}
                        {day.length > 1 && (
                          <button
                            type="button"
                            aria-label={`${all ? "Deselect" : "Select"} all on ${label}`}
                            onClick={() => tick(ids, !all)}
                            className="relative inline-flex h-8 items-center text-[13px] font-semibold text-primary transition-opacity duration-150 select-none after:absolute after:inset-x-0 after:-inset-y-1.5 hover:opacity-70 active:opacity-50 active:duration-0"
                          >
                            {all ? "Deselect all" : "Select all"}
                          </button>
                        )}
                      </div>
                      <div className="flex flex-col divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
                        {day.map((dive) => (
                          <PickerRow
                            key={dive.id}
                            dive={dive}
                            site={log.sites.get(dive.siteId)?.name}
                            on={ticked.has(dive.id)}
                            other={elsewhere(dive)}
                            icon={KindIcon}
                            onTick={tick}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </section>
            ))}
            {/* Something the list can't show: a dive logged offline is
                missing until it syncs. */}
            {drafts && (
              <p className="px-1 pt-2 text-[13px] text-muted-foreground">
                Dives waiting to sync aren’t listed.
              </p>
            )}
          </div>
        </FullSheetContent>
      </Drawer>

      {/* Beside the picker, not inside it: a drawer nested in another
          shrinks its parent away, and the list it asks about would go. */}
      {emptyConfirm && (
        <Drawer
          showSwipeHandle
          open={confirming}
          onOpenChange={(next) => !busy && !next && setConfirming(false)}
        >
          <DrawerContent role="alertdialog">
            <DrawerHeader className="pb-4">
              <DrawerTitle className="[overflow-wrap:anywhere]">
                {emptyConfirm.title}
              </DrawerTitle>
              <DrawerDescription>{emptyConfirm.description}</DrawerDescription>
            </DrawerHeader>
            {confirmError && (
              <p
                role="alert"
                className="px-4 pb-2 text-center text-[13px] text-destructive desk:px-6 desk:text-left"
              >
                {confirmError}
              </p>
            )}
            {desk ? (
              <DrawerFooter>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void confirm(true)}
                >
                  {confirmError ? "Try again" : emptyConfirm.action}
                </Button>
              </DrawerFooter>
            ) : (
              <div className="flex flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Button
                  variant="destructive"
                  className="h-12 rounded-[14px] bg-destructive text-base font-semibold text-white hover:bg-destructive/90 dark:bg-red-600 dark:hover:bg-red-600/90"
                  disabled={busy}
                  onClick={() => void confirm(true)}
                >
                  {confirmError ? "Try again" : emptyConfirm.action}
                </Button>
                <Button
                  variant="ghost"
                  className="h-12 rounded-[14px] text-base font-semibold text-primary"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </DrawerContent>
        </Drawer>
      )}
    </>
  )
}

// One dive, re-rendered only when its own tick or other trip changes, so
// a tap on a long log updates a row, not the whole list.
const PickerRow = memo(function PickerRow({
  dive,
  site,
  on,
  other,
  icon: KindIcon,
  onTick,
}: {
  dive: Dive
  site: string | undefined
  on: boolean
  other: string | undefined
  icon: Icon
  onTick: (ids: string[], on: boolean) => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={() => onTick([dive.id], !on)}
      className="flex min-h-15 items-center gap-3 py-2.5 pr-3.5 pl-3.5 text-left transition-colors duration-150 select-none [-webkit-touch-callout:none] hover:bg-muted/60 active:bg-muted active:duration-0"
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex size-5.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150",
          on
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/70"
        )}
      >
        <IconCheck
          className={cn(
            "size-3.5 stroke-3 transition-opacity duration-150",
            !on && "opacity-0"
          )}
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium">{site}</span>
        {/* The day heading gives the date, so the start time tells two
            dives on one day apart, as a site's Dives list does. */}
        <span className="flex min-w-0 items-center gap-3 overflow-hidden text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
          <span className="inline-flex shrink-0 items-center gap-1">
            <IconClockPlay aria-hidden className="size-[1.15em] shrink-0" />
            {clockTime(dive.startTime)}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1">
            <IconClock aria-hidden className="size-[1.15em] shrink-0" />
            {minutes(dive.duration)} min
          </span>
        </span>
        {other && (
          <span className="inline-flex min-w-0 items-center gap-1 text-[13px] text-muted-foreground">
            <KindIcon aria-hidden className="size-[1.15em] shrink-0" />
            <span className="truncate">
              {on ? `Moves from ${other}` : other}
            </span>
          </span>
        )}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium tabular-nums">
        <IconArrowBarToDown
          aria-hidden
          className="size-3.5 text-muted-foreground"
        />
        {depth(dive.maxDepth)} m
      </span>
    </button>
  )
})
