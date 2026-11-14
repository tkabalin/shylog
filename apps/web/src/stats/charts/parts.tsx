import { useEffect, useLayoutEffect, useState, type ReactNode } from "react"
import { useRouterState } from "@tanstack/react-router"

import { FormShown, Reveal } from "@/dive/form/rows"

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

// What a section has open, kept for its history entry: Back from a site
// found Show all and the rows it had opened closed again.
const kept = new Map<string, unknown>()

const useEntry = () =>
  useRouterState({ select: ({ location }) => location.state.__TSR_key ?? "" })

export function useKept<T>(name: string, initial: T) {
  const id = `${useEntry()} ${name}`
  const [value, setValue] = useState<T>(() =>
    kept.has(id) ? (kept.get(id) as T) : initial
  )
  const set = (next: T) => {
    kept.set(id, next)
    setValue(next)
  }
  return [value, set] as const
}

// Opens as the form's revealed rows do on a tap, but at once until the first
// tap, so rows Back restores don't grow under the kept scroll.
const restored = { current: false }
const tapped = { current: true }

export function Opening({
  instant,
  className,
  children,
}: {
  instant: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <FormShown.Provider value={instant ? restored : tapped}>
      <Reveal className={className}>{children}</Reveal>
    </FormShown.Provider>
  )
}

// The router restores Back's scroll before the sections below the records
// render, so the page is too short to land on and stops near the top: the
// position is kept here too, and set again once they have.
const scrolls = new Map<string, number>()

export function useKeptScroll(painted: boolean) {
  const entry = useEntry()
  // Removed as the screen goes, before the router scrolls to the next one's
  // top, which would be kept as this one's.
  useLayoutEffect(() => {
    const main = document.getElementById("main")
    if (!main) return
    const save = () => scrolls.set(entry, main.scrollTop)
    main.addEventListener("scroll", save, { passive: true })
    return () => main.removeEventListener("scroll", save)
  }, [entry])
  useLayoutEffect(() => {
    const top = scrolls.get(entry)
    if (painted && top != null) document.getElementById("main")!.scrollTop = top
  }, [painted, entry])
}

// A chart's table alternative, read by screen readers in place of the
// drawing, which is hidden from them.
export function SrTable({
  caption,
  head,
  rows,
  now = false,
}: {
  caption: string
  head: string[]
  rows: (string | number)[][]
  // Mounted by a tap after the screen has painted, so with nothing to wait
  // for: separate deferrals landed as separate commits mid-reveal.
  now?: boolean
}) {
  // Its rows come a painted frame after the screen: unseen, they were most
  // of a big log's first frame (the SAC table has a row per dive).
  const painted = usePainted() || now
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

// A section's heading button that opens or closes every row in it.
export function ExpandAll({
  every,
  onClick,
}: {
  every: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // About 44 px tall to the finger, while the heading keeps its line;
      // grown more upwards, so it stays off the first row 8 px below.
      className="relative -mr-1 px-1 text-[13px] font-medium text-primary transition-opacity duration-150 select-none after:absolute after:inset-x-0 after:-top-4 after:-bottom-2 active:opacity-60 active:duration-0"
    >
      {every ? "Collapse all" : "Expand all"}
    </button>
  )
}

export function Section({
  id,
  title,
  action,
  children,
}: {
  id: string
  title: string
  // A button for the whole section, at the heading's end.
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={`stats-${id}`}>
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <h2
          id={`stats-${id}`}
          className="text-[13px] font-semibold text-muted-foreground"
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}
