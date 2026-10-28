import { cardHeight, DiveCard } from "@/components/dive-card"
import type { LogView } from "@/data/log"
import type { MonthGroup as Group } from "@/log/filters"

// The heading (24px) and cards with 8px gaps.
const groupHeight = (cards: number) => 24 + cards * (cardHeight + 8)

// content-visibility lets the browser skip laying out groups off screen,
// while find in page and the screen-reader order stay whole. The intrinsic
// size is exact, so a restored scroll position lands on the same card.
// It also clips paint to the section, so the padding (cancelled by the
// margins) keeps the cards' rings and shadows, and the stuck heading's
// strip as the next month pushes it out, inside it.
export function MonthGroup({ group, log }: { group: Group; log: LogView }) {
  return (
    <section
      aria-labelledby={`month-${group.key}`}
      className="-mx-4 -mb-2 flex flex-col gap-2 px-4 pb-2 [content-visibility:auto]"
      style={{
        containIntrinsicSize: `auto ${groupHeight(group.dives.length)}px`,
      }}
    >
      {/* Draws the line under the bar while stuck (see LogHeader). The
          strip below adds room above the line without changing the height,
          which groupHeight and the cards' positions depend on. */}
      <div
        data-month-heading
        className="sticky top-[calc(max(0.75rem,env(safe-area-inset-top))+var(--log-bar-height,0px))] z-[5] -mx-4 flex h-6 items-center justify-between bg-background px-5 after:absolute after:inset-x-0 after:top-full after:h-1.5 after:border-b after:border-transparent after:bg-background data-stuck:after:border-border"
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
      {group.dives.map((dive) => (
        <DiveCard key={dive.id} dive={dive} log={log} />
      ))}
    </section>
  )
}
