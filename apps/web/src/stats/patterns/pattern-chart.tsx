import { cn } from "cn"

import { temperature } from "@/format/figures"

import { monthLetters } from "../charts/parts"
import type { Chart } from "./catalogue"

// The dives behind a pattern, drawn over its group rows, which say the same
// for screen readers, so the drawing is hidden from them.
export function PatternChart({
  chart,
  labels,
}: {
  chart: Chart
  // The groups' names, in the order of a chart's lanes.
  labels: string[]
}) {
  return (
    <div aria-hidden className="flex flex-col gap-1.5">
      {chart.kind === "threshold" ? (
        <Threshold chart={chart} />
      ) : chart.kind === "lanes" ? (
        <Lanes chart={chart} labels={labels} />
      ) : (
        <Months chart={chart} />
      )}
    </div>
  )
}

const dot = 6
const step = 8

// A stack of dots at most this tall before they close up, so a big log's
// lane stays short.
const tallest = 6

// Dots at one place stack upwards, the first at the bottom.
function Dot({
  left,
  level,
  rise = step,
  className,
  faded,
}: {
  left: string
  level: number
  rise?: number
  className: string
  faded?: boolean
}) {
  return (
    <span
      className={cn("absolute -translate-x-1/2 rounded-full", className)}
      style={{
        left,
        bottom: level * rise,
        width: dot,
        height: dot,
        opacity: faded ? 0.4 : undefined,
      }}
    />
  )
}

// Every dive along the water temperature, cold ones filled, with the
// cut-offs marked and the dives between them faded, so the split shows at
// a glance.
function Threshold({
  chart,
}: {
  chart: Extract<Chart, { kind: "threshold" }>
}) {
  const { dives, cuts } = chart
  const tenths = dives.map((dive) => dive.tenths)
  // Half a degree past either end, so no dot sits on the edge.
  const from = Math.min(...tenths) - 5
  const to = Math.max(...tenths) + 5
  const share = (value: number) => ((value - from) / (to - from)) * 100
  const at = (value: number) => `${share(value)}%`
  // Between the cut-offs, which the rule leaves out, the dots fade.
  const out = (value: number) => value >= cuts[0] * 10 && value <= cuts[1] * 10
  // Cold first in each stack, so the filled dots sit at the bottom.
  const stacks = new Map<number, boolean[]>()
  for (const dive of dives) {
    const stack = stacks.get(dive.tenths)
    if (stack) stack.push(dive.hit)
    else stacks.set(dive.tenths, [dive.hit])
  }
  for (const stack of stacks.values())
    stack.sort((a, b) => Number(b) - Number(a))
  const high = Math.max(...[...stacks.values()].map((s) => s.length))
  const rise = Math.min(step, (tallest * step) / high)
  // Cut-offs closer than about 45 px on a phone share one label, "16–17 °C",
  // as two would print over each other.
  const apart = share(cuts[1] * 10) - share(cuts[0] * 10)
  const cutLabels =
    cuts[0] === cuts[1]
      ? [{ at: cuts[0] * 10, text: temperature(cuts[0]) }]
      : apart < 16
        ? [
            {
              at: (cuts[0] + cuts[1]) * 5,
              text: `${temperature(cuts[0])}–${temperature(cuts[1])}`,
            },
          ]
        : cuts.map((cut) => ({ at: cut * 10, text: temperature(cut) }))
  return (
    <>
      <div className="relative" style={{ height: (high - 1) * rise + dot + 2 }}>
        {cuts.map((cut, i) => (
          <span
            key={i}
            className="absolute inset-y-0 w-px -translate-x-1/2 border-l border-dashed border-muted-foreground/50"
            style={{ left: at(cut * 10) }}
          />
        ))}
        {[...stacks].flatMap(([value, stack]) =>
          stack.map((hit, i) => (
            <Dot
              key={`${value} ${i}`}
              left={at(value)}
              level={i}
              rise={rise}
              faded={out(value)}
              className={
                hit ? "bg-primary" : "border border-muted-foreground/60"
              }
            />
          ))
        )}
      </div>
      <div className="relative h-4 border-t text-[11px] text-muted-foreground tabular-nums">
        {cutLabels.map((label) => (
          <span
            key={label.at}
            className="absolute top-0.5 -translate-x-1/2 whitespace-nowrap"
            style={{ left: at(label.at) }}
          >
            {label.text}&nbsp;°C
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
    </>
  )
}

// "12.3", "45": a value as the axis labels it.
const tick = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1)

// Each group's dives along one axis, a lane a group, with its average as a
// line through it: the sentence gives two averages, the dots whether six
// steady dives or one bad one made them. Dives close together stack in their
// lane.
function Lanes({
  chart,
  labels,
}: {
  chart: Extract<Chart, { kind: "lanes" }>
  labels: string[]
}) {
  const all = chart.lanes.flatMap((lane) => lane.values)
  const low = Math.min(...all)
  const high = Math.max(...all)
  // A twentieth of the range past either end, so no dot sits on the edge.
  const pad = (high - low || 1) / 20
  const [from, to] = [low - pad, high + pad]
  const at = (value: number) => `${((value - from) / (to - from)) * 100}%`
  // Each dot at its own value; dives within about a dot's width of each
  // other stack, by bins only as fine as that.
  const binOf = (value: number) =>
    Math.round(((value - from) / (to - from)) * 48)
  return (
    <>
      {chart.lanes.map((lane, i) => {
        const counts = new Map<number, number>()
        const placed = lane.values.map((value) => {
          const bin = binOf(value)
          const level = counts.get(bin) ?? 0
          counts.set(bin, level + 1)
          return { value, level }
        })
        const high = Math.max(...counts.values())
        const rise = Math.min(step, (tallest * step) / high)
        return (
          <div key={i} className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              {labels[i]}
            </span>
            {/* The average runs through the lane behind the dots, so a
                column at it stays whole, and rises above the stacks so it
                always shows; a tick above the dots read as a stray mark. */}
            <div
              className="relative"
              style={{ height: (high - 1) * rise + dot + 8 }}
            >
              <span
                className="absolute top-0 -bottom-0.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
                style={{ left: at(lane.average) }}
              />
              {placed.map(({ value, level }, j) => (
                <Dot
                  key={j}
                  left={at(value)}
                  level={level}
                  rise={rise}
                  // Solid, so stacks that close up don't darken.
                  className={
                    i === 0 ? "bg-primary" : "bg-zinc-300 dark:bg-zinc-600"
                  }
                />
              ))}
            </div>
          </div>
        )
      })}
      {/* The end labels sit under the end dots, not the padded edges. */}
      <div className="relative h-4 border-t text-[11px] text-muted-foreground tabular-nums">
        <span
          className="absolute top-0.5 -translate-x-[3px]"
          style={{ left: at(low) }}
        >
          {tick(Math.round(low * 10) / 10)}
        </span>
        <span
          className="absolute top-0.5 translate-x-[3px] whitespace-nowrap"
          style={{ right: `calc(100% - ${at(high)})` }}
        >
          {tick(Math.round(high * 10) / 10)} {chart.unit}
        </span>
      </div>
      <div className="flex gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-0.5 rounded-full bg-foreground" />
          Average
        </span>
      </div>
    </>
  )
}

// The region's year month by month: each month's average water as a bar,
// the two compared in the accent, months under five dives drawn as dashed
// outlines, as they can't count; a month with no dive has no mark.
function Months({ chart }: { chart: Extract<Chart, { kind: "months" }> }) {
  const few = chart.months.some((m) => m.count > 0 && m.count < 5)
  const averages = chart.months.flatMap((m) =>
    m.average == null ? [] : [m.average]
  )
  const top = Math.max(...averages)
  const coldest = Math.min(...averages)
  // A third of the range under the coldest, so it keeps a bar of its own
  // rather than a stub like an empty month's.
  const floor = coldest - Math.max(1, (top - coldest) * 0.3)
  const tall = 44
  return (
    <>
      {/* Room above for the compared months' values. */}
      <div className="grid grid-cols-12 items-end gap-1 pt-4">
        {chart.months.map((month, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            {month.average != null && (
              <span
                className={cn(
                  "relative w-full rounded-[3px]",
                  month.marked
                    ? "bg-primary"
                    : month.count < 5
                      ? "border border-dashed border-muted-foreground/60"
                      : "bg-muted-foreground/30"
                )}
                style={{
                  height: ((month.average - floor) / (top - floor)) * tall,
                }}
              >
                {month.marked && (
                  <span className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 text-[10px] font-medium whitespace-nowrap text-foreground tabular-nums">
                    {month.average.toFixed(1).replace("-", "−")}°
                  </span>
                )}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">
              {monthLetters[i]}
            </span>
          </div>
        ))}
      </div>
      {/* An outlined month can be warmer than the two compared, so the key
          says why it doesn't count. */}
      <div className="flex gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-primary" />
          Compared
        </span>
        {few && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] border border-dashed border-muted-foreground/60" />
            Under 5 dives
          </span>
        )}
      </div>
    </>
  )
}
