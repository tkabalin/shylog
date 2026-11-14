import { rateScale, roundTicks } from "@/stats/trend"

import { dives, rate, SrTable, tint } from "./parts"

// Plot height in px; the x axis is drawn in L/min and the y in dives, so
// the drawing stretches to the card's width.
const height = 100

// The standard normal's share below z (Abramowitz and Stegun 7.1.26, good to
// 1.5e-7), as JavaScript has no erf.
function normalShare(z: number) {
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2)
  const poly =
    t *
    (0.254829592 +
      t *
        (-0.284496736 +
          t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const erf = 1 - poly * Math.exp(-(z * z) / 2)
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2
}

// How the dives' SAC rates spread: a 1 L/min histogram, the normal curve
// for their mean and standard deviation, the mean, and one deviation either
// side as a band. Plain SVG, as the other charts below the trend are.
export function Spread({
  rates,
  mean,
  deviation,
}: {
  rates: readonly number[]
  mean: number
  deviation: number
}) {
  // A far-off rate goes in a last bin at the trend's top ("30+"), rather
  // than squeezing every other dive into the left of the axis.
  const cap = rateScale(rates).high
  const pinned = rates.some((r) => r > cap)
  const bins = new Map<number, number>()
  for (const r of rates) {
    const bin = Math.floor(Math.min(r, cap))
    bins.set(bin, (bins.get(bin) ?? 0) + 1)
  }
  const last = Math.max(...bins.keys())
  // Wide enough for the curve's tails, which a cut-off one looked broken.
  const low = Math.max(
    0,
    Math.min(Math.min(...bins.keys()) - 1, Math.floor(mean - 2.5 * deviation))
  )
  const high = Math.min(
    cap + 2,
    Math.max(last + 2, Math.ceil(mean + 2.5 * deviation))
  )
  const binLabel = (bin: number) =>
    pinned && bin === cap ? `${bin}+` : `${bin} to ${bin + 1}`
  // Dives expected in a 1 L/min window around v, so the curve shares the
  // bars' scale and never tops the dive count, however tight the spread.
  const expected = (v: number) =>
    rates.length *
    (normalShare((v + 0.5 - mean) / deviation) -
      normalShare((v - 0.5 - mean) / deviation))
  const top = Math.max(...bins.values(), expected(mean)) * 1.06
  const curve = Array.from(
    { length: Math.round((high - low) * 4) + 1 },
    (_, i) => {
      const v = low + i / 4
      return `${v},${top - expected(v)}`
    }
  ).join(" ")
  // Two round counts at most: 1, 2 or 5 times a power of ten.
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, top / 2)))
  const step = [1, 2, 5, 10]
    .map((m) => m * magnitude)
    .find((s) => Math.floor(top / s) <= 2)!
  const counts = [step, step * 2].filter((c) => c < top)
  // Inside the ends, where a label would hang off the plot, and clear of the
  // far-off bin's own label.
  const rateTicks = roundTicks(low + 1, pinned ? cap - 3 : high - 1, [10, 5, 2])
  // The band stays on the plot when a deviation runs past its ends.
  const band = [
    Math.max(low, mean - deviation),
    Math.min(high, mean + deviation),
  ]
  const x = (v: number) => `${((v - low) / (high - low)) * 100}%`
  const y = (count: number) => `${(1 - count / top) * 100}%`

  return (
    <div className="flex flex-col gap-2.5">
      <div aria-hidden className="flex select-none">
        <div className="relative w-5 shrink-0" style={{ height }}>
          {counts.map((count) => (
            <span
              key={count}
              className="absolute left-0 -translate-y-1/2 text-[11px] leading-4 text-muted-foreground tabular-nums"
              style={{ top: y(count) }}
            >
              {count}
            </span>
          ))}
        </div>
        <div className="relative flex-1 pb-4">
          <svg
            viewBox={`${low} 0 ${high - low} ${top}`}
            preserveAspectRatio="none"
            className="block w-full overflow-visible"
            style={{ height }}
          >
            <rect
              x={band[0]}
              y={0}
              width={band[1]! - band[0]!}
              height={top}
              fill={tint(7)}
            />
            {[0, ...counts].map((count) => (
              <line
                key={count}
                x1={low}
                x2={high}
                y1={top - count}
                y2={top - count}
                stroke="var(--border)"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {[...bins].map(([bin, count]) => (
              <rect
                key={bin}
                x={bin + 0.08}
                y={top - count}
                width={0.84}
                height={count}
                fill={tint(42)}
              />
            ))}
            <line
              x1={mean}
              x2={mean}
              y1={0}
              y2={top}
              stroke="var(--primary)"
              strokeWidth={1.25}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={curve}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {rateTicks.map((tick) => (
            <span
              key={tick}
              className="absolute bottom-0 -translate-x-1/2 text-[11px] leading-3.5 text-muted-foreground tabular-nums"
              style={{ left: x(tick) }}
            >
              {tick}
            </span>
          ))}
          {pinned && (
            <span
              className="absolute bottom-0 -translate-x-1/2 text-[11px] leading-3.5 text-muted-foreground tabular-nums"
              style={{ left: x(cap + 0.5) }}
            >
              {binLabel(cap)}
            </span>
          )}
        </div>
      </div>
      <div
        aria-hidden
        className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-muted-foreground"
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-2 rounded-[2px]"
            style={{ background: tint(42) }}
          />
          Dives
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 rounded-full bg-primary" />
          Bell curve
        </span>
        <span className="inline-flex items-center gap-1.5">
          {/* Drawn as the chart's line is: a 1.5px dashed border showed as
              one dot on an iPhone. */}
          <svg viewBox="0 0 2 12" className="h-3 w-0.5 overflow-visible">
            <line
              x1={1}
              x2={1}
              y1={0}
              y2={12}
              stroke="var(--primary)"
              strokeWidth={1.25}
              strokeDasharray="3 3"
            />
          </svg>
          Mean
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-3 rounded-[2px]"
            style={{ background: tint(12) }}
          />
          ±1 std dev
        </span>
      </div>
      <SrTable
        caption={`Spread of SAC rates: mean ${rate(mean)}, standard deviation ${rate(deviation)} L/min`}
        head={["SAC rate", "Dives"]}
        rows={[...bins]
          .sort(([a], [b]) => a - b)
          .map(([bin, count]) => [`${binLabel(bin)} L/min`, dives(count)])}
        // Opened by a tap on Distribution, after the screen.
        now
      />
    </div>
  )
}
