import { useEffect, useRef, useState, type ReactNode } from "react"
import { IconArrowBarToDown, IconHourglass } from "@tabler/icons-react"

import { countText } from "@/components/pickers/match"
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
    const update = () => {
      frame = 0
      const top = parseFloat(getComputedStyle(target).top)
      const rect = target.getBoundingClientRect()
      const offset = rect.top - element.getBoundingClientRect().top
      const isStuck = element.scrollTop > 0 && offset <= top + 0.5
      setStuck(isStuck)
      // A stuck heading sits right under the bar; one lookup finds it.
      const hit = isStuck
        ? (document
            .elementFromPoint(rect.left + 1, rect.bottom + 1)
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
      target.toggleAttribute(
        "data-heading-stuck",
        isStuck && !!element.querySelector("[data-month-heading]")
      )
    }
    const onScroll = () => {
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
  const h = hours(figures.seconds)
  return (
    <>
      <header className="relative px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] right-4 flex h-11 items-center">
          <SyncPill />
        </div>
        <p className="flex h-16 items-baseline gap-2 whitespace-nowrap tabular-nums">
          <span className="text-[52px] leading-14 font-semibold tracking-[-0.05em]">
            {/* "1,280", grouped as dates and figures elsewhere are. */}
            {countText(n)}
          </span>
          <span className="text-[17px] font-medium text-muted-foreground">
            {n === 1 ? "dive logged" : "dives logged"}
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
        className="sticky top-[max(0.75rem,env(safe-area-inset-top))] z-10 border-b border-transparent bg-background px-4 transition-[border-color] duration-200 data-stuck:not-data-heading-stuck:border-border"
      >
        {/* The status bar (or a margin, without one) above the bar once
            stuck, opaque over what is left of the count. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-full h-[max(0.75rem,env(safe-area-inset-top))] bg-background opacity-0 in-data-stuck:opacity-100"
        />
        {children}
      </div>
    </>
  )
}
