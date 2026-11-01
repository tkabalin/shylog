import { useEffect, useRef, useState, type ReactNode } from "react"
import { IconArrowBarToDown, IconHourglass } from "@tabler/icons-react"

import shyshark from "@/assets/shyshark.svg"
import { countText } from "@/components/pickers/match"
import { RollingNumber, useFrameLater } from "@/components/rolling-number"
import { SyncPill } from "@/components/sync-pill"
import { depth, hours } from "@/format/figures"
import type { headerFigures } from "@/log/filters"

// Whether the bar has reached its sticky position, read from layout on
// each scroll frame. The month heading stuck under it is marked directly
// (only when it changes), so the line moves below both without a render.
function useStuck(scroller: string) {
  const bar = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const element = document.querySelector<HTMLElement>(scroller)
    const target = bar.current
    if (!element || !target) return
    let frame = 0
    let heading: HTMLElement | null = null
    let misses = 0
    const update = () => {
      frame = 0
      const top = parseFloat(getComputedStyle(target).top)
      const rect = target.getBoundingClientRect()
      const offset = rect.top - element.getBoundingClientRect().top
      const isStuck = element.scrollTop > 0 && offset <= top + 0.5
      setStuck(isStuck)
      // A stuck heading sits right under the bar; one lookup at its middle
      // finds it, as wide screens cap the list to a centred column.
      const hit = isStuck
        ? (document
            .elementFromPoint(rect.left + rect.width / 2, rect.bottom + 1)
            ?.closest<HTMLElement>("[data-month-heading]") ?? null)
        : null
      // A heading pushed up behind the bar keeps its (hidden) line until the
      // next one arrives, so the line never jumps back up to the bar.
      const next =
        hit ??
        (heading && heading.getBoundingClientRect().top < rect.bottom
          ? heading
          : null)
      if (next !== heading) {
        heading?.removeAttribute("data-stuck")
        next?.setAttribute("data-stuck", "")
        heading = next
      }
      // While the list has month headings the line is theirs alone, so the
      // bar never draws one above the first month before it arrives.
      const headings = !!element.querySelector("[data-month-heading]")
      target.toggleAttribute("data-heading-stuck", isStuck && headings)
      // A month just restored into view isn't hit-testable until
      // content-visibility paints it, so a stuck bar with no heading under
      // it looks again for a few frames rather than waiting for a scroll.
      if (isStuck && headings && !next && misses < 5) {
        misses++
        frame = requestAnimationFrame(update)
      }
    }
    const onScroll = () => {
      misses = 0
      frame ||= requestAnimationFrame(update)
    }
    // After the router has restored the scroll position.
    frame = requestAnimationFrame(update)
    element.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      element.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [scroller])
  return [bar, stuck] as const
}

// LogHifi2's Hero count header (D15) as an iOS large title (D27): the count
// and strip scroll away with the list, and the bar with the search and
// filters sticks under the status bar.
export function LogHeader({
  figures,
  children,
}: {
  figures: ReturnType<typeof headerFigures>
  children?: ReactNode
}) {
  const [bar, stuck] = useStuck("#main")
  // Month headings stick under the bar; its height changes only on resize.
  useEffect(() => {
    const target = bar.current
    const page = target?.parentElement
    if (!target || !page) return
    const observer = new ResizeObserver(() =>
      page.style.setProperty("--log-bar-height", `${target.offsetHeight}px`)
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [bar])
  const n = figures.count
  // In step with the digits, which start rolling a frame later.
  const noun = useFrameLater(n)
  const h = hours(figures.seconds)
  return (
    <>
      <header className="relative px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] md:mx-auto md:w-full md:max-w-3xl">
        <div className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] right-4 flex h-16 items-center gap-2">
          <SyncPill />
          {/* The app icon's shyshark, so the Log carries the brand. */}
          <img
            src={shyshark}
            alt=""
            width={48}
            height={48}
            className="size-12 drop-shadow-[0_2px_3px_rgb(42_26_10/0.25)] dark:drop-shadow-none"
          />
        </div>
        <p className="flex h-16 items-baseline gap-2 whitespace-nowrap tabular-nums">
          <span className="text-[52px] leading-14 font-semibold tracking-[-0.05em]">
            {/* "1,280", grouped as dates and figures elsewhere are. A filter
                or a sync that changes it rolls the digits that change. */}
            <RollingNumber value={n} text={countText(n)} />
          </span>
          <span className="text-[17px] font-medium text-muted-foreground">
            {noun === 1 ? "dive logged" : "dives logged"}
          </span>
        </p>
        <p className="flex flex-wrap items-center gap-x-3.5 pt-0.5 pb-4 text-base text-muted-foreground tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <IconHourglass aria-hidden className="size-[1.15em]" />
            <span>
              <span className="font-semibold">{h} h</span> underwater
            </span>
          </span>
          {figures.deepest != null && (
            <span className="inline-flex items-center gap-1.5">
              <IconArrowBarToDown aria-hidden className="size-[1.15em]" />
              <span>
                deepest{" "}
                <span className="font-semibold">
                  {depth(figures.deepest)} m
                </span>
              </span>
            </span>
          )}
        </p>
      </header>
      <div
        ref={bar}
        data-log-bar
        data-stuck={stuck ? "" : undefined}
        className="sticky top-[max(0.75rem,env(safe-area-inset-top))] z-10 border-b border-transparent bg-background px-4 transition-[border-color] duration-200 data-stuck:not-data-heading-stuck:border-border md:px-[max(1rem,calc((100%-46rem)/2))]"
      >
        {children}
      </div>
    </>
  )
}
