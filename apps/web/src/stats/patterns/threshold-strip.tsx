import { temperature } from "@/format/figures"

import type { Pattern } from "./catalogue"

// Every dive along the water temperature, cold ones filled, with the
// cut-offs marked and the dives between them faded, so the split shows at
// a glance. Dives at one reading stack. The group rows under it say the
// same for screen readers.
export function ThresholdStrip({
  strip,
}: {
  strip: NonNullable<Pattern["strip"]>
}) {
  const { dives, cuts } = strip
  const tenths = dives.map((dive) => dive.tenths)
  // Half a degree past either end, so no dot sits on the edge.
  const from = Math.min(...tenths) - 5
  const to = Math.max(...tenths) + 5
  const at = (value: number) => `${((value - from) / (to - from)) * 100}%`
  // Between the cut-offs, which the rule leaves out, the dots fade.
  const out = (value: number) => value >= cuts[0] * 10 && value <= cuts[1] * 10
  // Cold first in each stack, so the filled dots sit at the bottom.
  const stacks = new Map<number, boolean[]>()
  for (const dive of dives)
    stacks.set(dive.tenths, [...(stacks.get(dive.tenths) ?? []), dive.hit])
  for (const stack of stacks.values())
    stack.sort((a, b) => Number(b) - Number(a))
  const tallest = Math.max(...[...stacks.values()].map((s) => s.length))
  const dot = 6
  const step = 8
  const cutLabels = cuts[0] === cuts[1] ? [cuts[0]] : cuts
  return (
    <div aria-hidden className="flex flex-col gap-1.5">
      <div className="relative" style={{ height: tallest * step }}>
        {cuts.map((cut, i) => (
          <span
            key={i}
            className="absolute inset-y-0 w-px -translate-x-1/2 border-l border-dashed border-muted-foreground/50"
            style={{ left: at(cut * 10) }}
          />
        ))}
        {[...stacks].flatMap(([value, stack]) =>
          stack.map((hit, i) => (
            <span
              key={`${value} ${i}`}
              className={
                hit
                  ? "absolute -translate-x-1/2 rounded-full bg-primary"
                  : "absolute -translate-x-1/2 rounded-full border border-muted-foreground/60"
              }
              style={{
                left: at(value),
                bottom: i * step,
                width: dot,
                height: dot,
                opacity: out(value) ? 0.4 : undefined,
              }}
            />
          ))
        )}
      </div>
      <div className="relative h-4 border-t text-[11px] text-muted-foreground tabular-nums">
        {cutLabels.map((cut) => (
          <span
            key={cut}
            className="absolute top-0.5 -translate-x-1/2 whitespace-nowrap"
            style={{ left: at(cut * 10) }}
          >
            {temperature(cut)}&nbsp;°C
          </span>
        ))}
      </div>
      <div className="flex gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-primary" />
          Felt cold
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full border border-muted-foreground/60" />
          Didn’t
        </span>
      </div>
    </div>
  )
}
