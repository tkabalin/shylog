import { IconChevronRight } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { cn } from "cn"

import { Card } from "@/components/ui/card"
import type { LogView } from "@/data/log"
import { listRow, pressable } from "@/you/parts"

import { cachedPatterns } from "../cache"
import { Section } from "../charts/parts"
import { PatternRow } from "./pattern-detail"

// The three strongest findings under Records and averages, and the rest a
// screen away. Hidden when none can be in the three.
export function PatternsCard({
  log,
  year,
}: {
  log: LogView
  year: string | undefined
}) {
  const { top, all } = cachedPatterns(log, year)
  if (!top.length) return null
  return (
    <Section id="patterns" title="Patterns">
      <Card className="gap-0 divide-y py-0">
        {top.map((pattern) => (
          <PatternRow key={pattern.id} pattern={pattern} />
        ))}
        {/* One level deeper, with Statistics behind it for Back. */}
        <Link
          to="/stats/patterns"
          search={{ year: year ? Number(year) : undefined }}
          state={{ pushed: true }}
          className={cn(
            listRow,
            pressable,
            "min-h-11 font-medium text-primary"
          )}
        >
          <span className="flex-1">All patterns</span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {all.length.toLocaleString("en-GB")}
          </span>
          <IconChevronRight
            aria-hidden
            className="size-3.5 shrink-0 stroke-[2.25] text-muted-foreground"
          />
        </Link>
      </Card>
    </Section>
  )
}
