import { useId, useState, type ComponentType, type ReactNode } from "react"
import { IconChevronDown } from "@tabler/icons-react"
import { cn } from "cn"

import { Card } from "@/components/ui/card"
import { listRow, pressable } from "@/you/parts"

import { Opening, Section, useKept } from "./parts"
import { Strip, type Segment } from "./strip"

export interface Answer {
  key: string
  label: string
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  // The one-line answer the row leads with, "Mostly mild".
  answer: string
  segments: Segment[]
  unlogged?: number
  note?: ReactNode
}

// A section of one-line answers, each with its proportion strip behind a
// tap, and a button in the heading that opens or closes them all.
export function Answers({
  id,
  title,
  rows,
}: {
  id: string
  title: string
  rows: Answer[]
}) {
  const [shown, setShown] = useKept<ReadonlySet<string>>(id, new Set())
  // Rows Back restores open at once; a tap's ease open.
  const [still, setStill] = useState(true)
  if (!rows.length) return null
  const open = (keys: Iterable<string>) => {
    setStill(false)
    setShown(new Set(keys))
  }
  const every = rows.every((row) => shown.has(row.key))
  const toggle = (key: string) => {
    const next = new Set(shown)
    if (!next.delete(key)) next.add(key)
    open(next)
  }
  return (
    <Section
      id={id}
      title={title}
      action={
        <button
          type="button"
          onClick={() => open(every ? [] : rows.map((row) => row.key))}
          // About 44 px tall to the finger, while the heading keeps its line;
          // grown more upwards, so it stays off the first row 8 px below.
          className="relative -mr-1 px-1 text-[13px] font-medium text-primary transition-opacity duration-150 select-none after:absolute after:inset-x-0 after:-top-4 after:-bottom-2 active:opacity-60 active:duration-0"
        >
          {every ? "Collapse all" : "Expand all"}
        </button>
      }
    >
      <Card className="gap-0 divide-y py-0">
        {rows.map((row) => (
          <AnswerRow
            key={row.key}
            row={row}
            open={shown.has(row.key)}
            still={still}
            onToggle={() => toggle(row.key)}
          />
        ))}
      </Card>
    </Section>
  )
}

function AnswerRow({
  row,
  open,
  still,
  onToggle,
}: {
  row: Answer
  open: boolean
  still: boolean
  onToggle: () => void
}) {
  const panel = useId()
  const Icon = row.icon
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panel : undefined}
        onClick={onToggle}
        className={cn(listRow, pressable, "min-h-13 gap-2.5")}
      >
        <Icon aria-hidden className="size-4.5 shrink-0 text-muted-foreground" />
        {/* The label stays whole; a long answer wraps on the right. */}
        <span className="shrink-0 text-sm whitespace-nowrap text-muted-foreground">
          {row.label}
        </span>
        <span className="min-w-0 flex-1 text-right font-medium text-pretty">
          {row.answer}
        </span>
        <IconChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
            open && "rotate-180"
          )}
        />
      </button>
      {/* Eases open on the tap, as the import's Left out row does, rather
          than pushing the rows below down at once. */}
      {open && (
        <Opening instant={still}>
          <div id={panel} className="flex flex-col gap-2 pr-4 pb-4 pl-11">
            <Strip
              caption={row.label}
              segments={row.segments}
              unlogged={row.unlogged}
            />
            {row.note && (
              <p className="text-xs/[1.45] text-pretty text-muted-foreground">
                {row.note}
              </p>
            )}
          </div>
        </Opening>
      )}
    </div>
  )
}
