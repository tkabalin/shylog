import { useEffect, useState, type ReactNode } from "react"

// The accent mixed into the card, as the boards tint their bars: 100 is the
// accent itself.
export const tint = (percent: number) =>
  `color-mix(in oklab, var(--primary) ${percent}%, var(--card))`

// A ramp from a faint floor to the accent, one step per level. The floor
// is set per theme in index.css, so the faintest still shows on a dark card.
export const ramp = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    count === 1
      ? tint(100)
      : `color-mix(in oklab, var(--primary) ${Math.round((100 * i) / (count - 1))}%, var(--stats-ramp-floor))`
  )

// Years along an axis: two digits once they crowd it ("’26"), and then
// only every few, counted back from the latest, so labels never touch.
export function yearLabels(years: string[]) {
  const step = Math.ceil(years.length / 8)
  return years.map((year, i) =>
    (years.length - 1 - i) % step
      ? ""
      : years.length > 5
        ? `’${year.slice(2)}`
        : year
  )
}

// A share that is neither none nor all never rounds to 0 % or 100 %, so one
// nitrox dive in 300 doesn't read as none.
export function percent(count: number, total: number) {
  const share = Math.round((count / total) * 100)
  return `${count && count < total ? Math.min(99, Math.max(1, share)) : share}%`
}

export const rate = (sac: number) => sac.toFixed(1)

export const monthLetters = "JFMAMJJASOND"
export const fullMonths =
  "January February March April May June July August September October November December".split(
    " "
  )

export const dives = (count: number) =>
  `${count.toLocaleString("en-GB")} ${count === 1 ? "dive" : "dives"}`

// True from the frame after the first paint: what isn't seen at first can
// render then, so the tap that opened the screen shows it sooner.
export function usePainted() {
  const [painted, setPainted] = useState(false)
  useEffect(() => {
    let timeout = 0
    const frame = requestAnimationFrame(() => {
      timeout = window.setTimeout(() => setPainted(true))
    })
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timeout)
    }
  }, [])
  return painted
}

// A chart's table alternative, read by screen readers in place of the
// drawing, which is hidden from them.
export function SrTable({
  caption,
  head,
  rows,
}: {
  caption: string
  head: string[]
  rows: (string | number)[][]
}) {
  // Its rows come a painted frame after the screen: unseen, they were most
  // of a big log's first frame (the SAC table has a row per dive).
  const painted = usePainted()
  // A table ignores the height sr-only gives it, so a long log's stretched
  // the page; the wrapper clips it.
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {painted &&
            rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) =>
                  j === 0 ? (
                    <th key={j} scope="row">
                      {cell}
                    </th>
                  ) : (
                    <td key={j}>{cell}</td>
                  )
                )}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

export function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={`stats-${id}`}>
      <h2
        id={`stats-${id}`}
        className="mb-2 px-1 text-[13px] font-semibold text-muted-foreground"
      >
        {title}
      </h2>
      {children}
    </section>
  )
}
