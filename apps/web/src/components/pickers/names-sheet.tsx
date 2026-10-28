import { useCallback, useRef, useState } from "react"
import { normaliseName } from "@shylog/core"
import {
  IconBuildingStore,
  IconLuggage,
  IconPlus,
  IconX,
} from "@tabler/icons-react"

import { cn } from "cn"

import { Drawer } from "@/components/ui/drawer"

import { diveCount, Highlighted, matchName, nameLimit, tidyName } from "./match"
import { BarButton, FullSheetContent, SheetBar } from "./sheet"

export interface Candidate {
  id: string
  name: string
  // Dives together, or a dive centre's or trip's dives.
  count: number
}

type Kind = "person" | "diveCentre" | "trip"

const kinds = {
  person: { placeholder: "Name", empty: "Type a name to add someone" },
  diveCentre: {
    placeholder: "Dive centre",
    empty: "Type a name to add a dive centre",
  },
  trip: { placeholder: "Trip", empty: "Type a name to add a trip" },
} satisfies Record<Kind, { placeholder: string; empty: string }>

// Buddies, dive professionals, the dive centre and the trip (D29): a
// full-height sheet like iOS Calendar's Add Invitees. The chosen names sit
// at the top over a field with the keyboard up, then everyone in recent
// order, narrowing to matches and Add as you type.
export function NamesSheet({
  open,
  onOpenChange,
  title,
  kind,
  multiple,
  candidates,
  selected,
  elsewhere,
  onChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  kind: Kind
  multiple: boolean
  // Most recently used first.
  candidates: Candidate[]
  selected: string[]
  // People on the dive in the other role, never offered here, since one
  // person can't be both on a dive, with that role's name for the note.
  elsewhere?: { ids: string[]; role: string }
  onChange: (ids: string[]) => void
  // Makes the entity, returning its new id.
  onCreate: (name: string) => string
}) {
  const [query, setQuery] = useState("")
  const [chipsHidden, setChipsHidden] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  // iOS raises the keyboard only for a focus inside the tap, and the field
  // mounts within the row's tap that opens the sheet, so it takes focus
  // there rather than from initialFocus a few frames later. Focus then goes
  // back to the row on close, which the drawer no longer sees.
  const opener = useRef<HTMLElement | null>(null)
  const mountField = useCallback((field: HTMLInputElement | null) => {
    input.current = field
    // StrictMode attaches the ref twice, when the field already has focus.
    if (!field || document.activeElement === field) return
    opener.current = document.activeElement as HTMLElement | null
    field.focus({ preventScroll: true })
  }, [])
  // A single choice closes the sheet, which shows the names it opened with
  // until it's gone, so its rows and chip don't change as it slides away.
  const [held, setHeld] = useState<string[] | null>(null)
  const shown = held ?? selected
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const other = new Set(elsewhere?.ids)
  const pool = candidates.filter(
    (c) => !shown.includes(c.id) && !other.has(c.id)
  )
  const typed = tidyName(query)
  const key = normaliseName(typed)
  const matches = key
    ? pool
        .map((c) => ({ c, match: matchName(c.name, typed)! }))
        .filter(({ match }) => match)
        // Stable, so ties keep the recent order.
        .sort((a, b) => a.match.rank - b.match.rank)
    : pool.map((c) => ({ c, match: null }))
  const same = candidates.find((c) => normaliseName(c.name) === key)
  const note = !same
    ? null
    : shown.includes(same.id)
      ? "Already on this dive"
      : other.has(same.id)
        ? `On this dive as ${elsewhere!.role}`
        : null

  const close = () => onOpenChange(false)
  const choose = (id: string) => {
    if (!multiple) {
      setHeld(selected)
      onChange([id])
      onOpenChange(false)
      return
    }
    setQuery("")
    onChange([...selected, id])
    input.current?.focus()
  }

  return (
    <Drawer
      showSwipeHandle
      open={open}
      onOpenChange={onOpenChange}
      // Cleared once the sheet is gone, so the list doesn't change under it
      // as it slides away.
      onOpenChangeComplete={(isOpen) => {
        setHeld(null)
        if (!isOpen) setQuery("")
      }}
    >
      <FullSheetContent initialFocus={input} finalFocus={opener}>
        <SheetBar
          title={title}
          end={
            <BarButton strong onClick={close}>
              Done
            </BarButton>
          }
        />
        {/* A big group's chips scroll within a third of the screen, so the
            field and the suggestions stay above the keyboard. */}
        <div
          onScroll={(event) =>
            setChipsHidden(event.currentTarget.scrollTop > 0)
          }
          ref={(el) => {
            // Opened scrolled down to the field: fade the edge at once.
            if (el) setChipsHidden(el.scrollTop > 0)
          }}
          className={cn(
            "flex max-h-[30dvh] shrink-0 flex-wrap items-center gap-2 overflow-y-auto overscroll-contain border-b px-4 pt-1 pb-2.5",
            // Chips scrolled out of sight fade at the top, so the edge reads
            // as more above rather than a clipped row.
            chipsHidden &&
              "[mask-image:linear-gradient(to_bottom,transparent,black_1.25rem)]"
          )}
        >
          {shown.map((id) => {
            const name = byId.get(id)?.name ?? ""
            return (
              <span
                key={id}
                // A new chip grows in where the tapped name went; those already there
                // when the sheet opens arrive with it.
                className="inline-flex h-10 max-w-full items-center gap-1 rounded-full bg-muted pr-1 pl-3.5 text-[15px] font-medium transition-[opacity,scale] duration-150 ease-out starting:scale-95 starting:opacity-0 group-data-starting-style/drawer-popup:starting:scale-100 group-data-starting-style/drawer-popup:starting:opacity-100 motion-reduce:starting:scale-100"
              >
                <span className="truncate">{name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  onClick={() => onChange(selected.filter((s) => s !== id))}
                  // 44 px tall but narrow, so a tap on the end of the name
                  // never removes the person.
                  className="relative inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-opacity duration-150 after:absolute after:-inset-y-2 after:-right-1 after:left-0 hover:opacity-70 active:opacity-50 active:duration-0"
                >
                  <IconX aria-hidden className="size-4" />
                </button>
              </span>
            )
          })}
          {(multiple || !shown.length) && (
            <input
              ref={mountField}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                // The exact name first, then the typed name as a new
                // person, so "Ann" never quietly picks "Anna".
                if (same) {
                  if (matches.some(({ c }) => c.id === same.id)) choose(same.id)
                } else if (typed) choose(onCreate(typed))
              }}
              aria-label={title}
              maxLength={nameLimit}
              placeholder={kinds[kind].placeholder}
              enterKeyHint={multiple ? "next" : "done"}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
              spellCheck={false}
              // A line of its own, so a long name typed is never squeezed
              // beside the last chip.
              className="h-10 min-w-0 basis-full bg-transparent px-0.5 text-base outline-none placeholder:text-muted-foreground/60"
            />
          )}
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom),var(--keyboard,0px))]">
          {!key && matches.length > 0 && (
            <h3 className="px-4 pt-4 pb-1 text-[13px] font-semibold text-muted-foreground">
              Recent
            </h3>
          )}
          <div
            role="listbox"
            aria-label="Suggestions"
            className="flex flex-col"
          >
            {matches.map(({ c, match }) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => choose(c.id)}
                className="flex min-h-13.5 w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-150 not-first:border-t hover:bg-muted/60 active:bg-muted active:duration-0"
              >
                <Avatar kind={kind} name={c.name} />
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="truncate text-base font-medium tracking-[-0.01em]">
                    {match ? <Highlighted parts={match.parts} /> : c.name}
                  </span>
                  <span className="text-[13px] text-muted-foreground tabular-nums">
                    {c.count === 0
                      ? "New"
                      : kind === "person"
                        ? `${diveCount(c.count)} together`
                        : diveCount(c.count)}
                  </span>
                </span>
              </button>
            ))}
            {typed && !same && (
              <button
                type="button"
                onClick={() => choose(onCreate(typed))}
                className="flex min-h-13.5 w-full items-center gap-3 border-t px-4 py-2 text-left text-primary transition-colors duration-150 first:border-t-0 hover:bg-muted/60 active:bg-muted active:duration-0"
              >
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10"
                >
                  <IconPlus className="size-4" />
                </span>
                <span className="min-w-0 truncate text-base font-medium">
                  Add “{typed}”
                </span>
              </button>
            )}
          </div>
          {(note ||
            (!key && !matches.length && (multiple || !shown.length))) && (
            <p className="px-4 py-3.5 text-sm text-muted-foreground">
              {note ?? kinds[kind].empty}
            </p>
          )}
        </div>
      </FullSheetContent>
    </Drawer>
  )
}

// By grapheme, so an emoji built from several code points (👩🏽‍💻) stays
// whole rather than losing its skin tone and laptop.
const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" })
// A suffix isn't the surname: "… Montgomery III" is CM, not CI.
const suffix = /^(jr|sr|ii|iii|iv)\.?$/i
const initials = (name: string) => {
  const words = name.trim().split(/\s+/)
  if (words.length > 2 && suffix.test(words.at(-1)!)) words.pop()
  const first = (word: string | undefined) => {
    const [grapheme] = graphemes.segment(word ?? "")
    return grapheme?.segment ?? ""
  }
  return (
    first(words[0]) + (words.length > 1 ? first(words.at(-1)) : "")
  ).toUpperCase()
}

function Avatar({ kind, name }: { kind: Kind; name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
    >
      {kind === "person" ? (
        initials(name)
      ) : kind === "trip" ? (
        <IconLuggage className="size-4" />
      ) : (
        <IconBuildingStore className="size-4" />
      )}
    </span>
  )
}
