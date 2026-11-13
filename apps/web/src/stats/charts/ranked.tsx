import { useState } from "react"
import { flushSync } from "react-dom"
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react"
import type { EntityKind } from "@shylog/core"
import { Link } from "@tanstack/react-router"
import { cn } from "cn"

import { Card } from "@/components/ui/card"
import { listRow, pressable } from "@/you/parts"

import { Opening, tint, useKept } from "./parts"

interface Row {
  // The entity's id, which the row opens.
  key: string
  name: string
  detail?: string | null
  count: number
}

// How many show until Show all opens the rest in place.
const top = 3

// StatsHifi's ranked lists: a name with a smaller line beside it, the
// count, and a bar against the first, which takes the accent. Each row opens
// its site, buddy or region.
export function Ranked({
  label,
  kind,
  rows,
  avatar = false,
}: {
  label: string
  kind: EntityKind
  rows: Row[]
  // Initials before each row (buddies).
  avatar?: boolean
}) {
  const [all, setAll] = useKept(`ranked ${kind}`, false)
  // Back restores the rest open at once; a tap eases it open.
  const [still, setStill] = useState(true)
  const max = rows[0]?.count ?? 1
  const item = (row: Row) => (
    <li key={row.key}>
      {/* One level deeper, with Statistics behind it for Back. */}
      <Link
        to="/you/entities/$kind/$id"
        params={{ kind, id: row.key }}
        state={{ pushed: true, fromStats: true }}
        className={cn(listRow, pressable, "gap-3 py-3 pr-3.5")}
      >
        {avatar && (
          <span
            aria-hidden
            className={
              row.count === max
                ? "flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/9 text-xs font-semibold text-primary dark:bg-primary/14"
                : "flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
            }
          >
            {initials(row.name)}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-1.75">
          {/* The detail gives way first, as the name says which row it is. */}
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="max-w-full shrink-0 truncate font-medium">
              {row.name}
            </span>
            {row.detail && (
              <span className="min-w-0 truncate text-[13px] text-muted-foreground">
                {row.detail}
              </span>
            )}
          </span>
          <span
            aria-hidden
            // Never thinner than a dot beside a far bigger first.
            className="block h-1 min-w-1 rounded-[2px]"
            style={{
              width: `${(row.count / max) * 100}%`,
              background: row.count === max ? "var(--primary)" : tint(42),
            }}
          />
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium tabular-nums">
          {row.count.toLocaleString("en-GB")}
          <IconChevronRight
            aria-hidden
            className="size-3.5 stroke-[2.25] text-muted-foreground"
          />
        </span>
      </Link>
    </li>
  )
  return (
    <Card className="gap-0 py-0">
      <ol aria-label={label} className="divide-y">
        {rows.slice(0, top).map(item)}
      </ol>
      {all && (
        // Eases open, as the conditions' rows do.
        <Opening instant={still}>
          <ol
            aria-label={`${label}, the rest`}
            start={top + 1}
            className="divide-y border-t"
          >
            {rows.slice(top).map(item)}
          </ol>
        </Opening>
      )}
      {rows.length > top && (
        <button
          type="button"
          aria-expanded={all}
          onClick={(event) => {
            setStill(false)
            if (!all) return setAll(true)
            // Closing takes the rows above the button away at once, which
            // left a long list's diver down in Tags where the page doesn't
            // anchor its scroll (WebKit): the button stays under the finger.
            const button = event.currentTarget
            const before = button.getBoundingClientRect().top
            flushSync(() => setAll(false))
            button
              .closest("#main")
              ?.scrollBy(0, button.getBoundingClientRect().top - before)
          }}
          className={cn(
            listRow,
            pressable,
            "min-h-11 border-t font-medium text-primary"
          )}
        >
          <span className="flex-1">
            {all ? "Show fewer" : `Show all ${rows.length}`}
          </span>
          <IconChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 transition-transform duration-200 ease-out",
              all && "rotate-180"
            )}
          />
        </button>
      )}
    </Card>
  )
}

// "Sam Naidoo" → "SN", "Cher" → "C", "Jan de Wet Jr" → "JW".
const initials = (name: string) => {
  // Words that start with a letter, so "🐙 Octo" is "O", leaving out a
  // suffix; a name with none shows its first character, by code point so
  // an emoji stays whole.
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
    .filter((word, i) => i === 0 || !/^(jr|sr|ii|iii|iv)\.?$/i.test(word))
  if (!words.length) return Array.from(name.trim())[0] ?? ""
  const first = Array.from(words[0]!)[0]!
  const last = words.length > 1 ? Array.from(words.at(-1)!)[0]! : ""
  return (first + last).toUpperCase()
}
