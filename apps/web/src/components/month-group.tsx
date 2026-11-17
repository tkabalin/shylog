import { memo } from "react"

import { cardProps, DiveCard } from "@/components/dive-card"
import type { LogView } from "@/data/log"
import type { MonthGroup as Group } from "@/log/filters"
import { cardGap, groupHeight, headingHeight, spacerHeight } from "@/log/window"

// Only the cards from..to are mounted (see DiveList). Spacers keep the
// others' room, so the month keeps its exact height and a restored scroll
// position lands on the same card.
export const MonthGroup = memo(function MonthGroup({
  group,
  log,
  from,
  to,
}: {
  group: Group
  log: LogView
  from: number
  to: number
}) {
  const after = group.dives.length - to
  // content-visibility skips laying out mounted months off screen. It clips
  // paint to the section, so the padding the margins cancel keeps the cards'
  // rings and shadows, and the stuck heading's strip, inside it.
  return (
    <section
      aria-labelledby={`month-${group.key}`}
      className="-mx-4 -mb-2 flex flex-col px-4 pb-2 [content-visibility:auto]"
      style={{
        gap: cardGap,
        containIntrinsicSize: `auto ${groupHeight(group.dives.length)}px`,
      }}
    >
      {/* Draws the line under the bar while stuck (see LogHeader). The
          strip below adds room above the line without changing the height,
          which groupHeight and the cards' positions depend on. */}
      <div
        data-month-heading
        className="sticky top-[calc(max(0.75rem,env(safe-area-inset-top))+var(--log-bar-height,0px))] z-[5] -mx-4 flex items-center justify-between bg-background px-5 after:absolute after:inset-x-0 after:top-full after:h-1.5 after:border-b after:border-transparent after:bg-background data-stuck:after:border-border"
        style={{ height: headingHeight }}
      >
        <h2
          id={`month-${group.key}`}
          className="text-[13px] font-semibold tracking-[-0.005em] text-muted-foreground"
        >
          {group.label}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          <span className="sr-only">Dives: </span>
          {group.count}
        </span>
      </div>
      {from > 0 && <div style={{ height: spacerHeight(from) }} />}
      {group.dives.slice(from, to).map((dive) => (
        <DiveCard key={dive.id} dive={dive} {...cardProps(dive, log)} />
      ))}
      {after > 0 && <div style={{ height: spacerHeight(after) }} />}
    </section>
  )
})
