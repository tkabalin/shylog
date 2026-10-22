import { cardHeight, DiveCard } from "@/components/dive-card"
import type { LogView } from "@/data/log"
import type { MonthGroup as Group } from "@/log/filters"

// The heading (24px) and cards with 8px gaps.
const groupHeight = (cards: number) => 24 + cards * (cardHeight + 8)

// content-visibility lets the browser skip laying out groups off screen,
// while find in page and the screen-reader order stay whole. The intrinsic
// size is exact, so a restored scroll position lands on the same card.
export function MonthGroup({ group, log }: { group: Group; log: LogView }) {
  return (
    <section
      aria-labelledby={`month-${group.key}`}
      className="flex flex-col gap-2 [content-visibility:auto]"
      style={{
        containIntrinsicSize: `auto ${groupHeight(group.dives.length)}px`,
      }}
    >
      <div className="sticky top-[calc(2.75rem+env(safe-area-inset-top)+var(--log-bar-height,0px))] z-[5] -mx-4 flex h-6 items-center justify-between bg-background/85 px-5 backdrop-blur-md [@media(prefers-reduced-transparency:reduce)]:bg-background">
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
