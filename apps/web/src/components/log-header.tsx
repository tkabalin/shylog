import { useEffect, useRef, useState, type ReactNode } from "react"
import { IconArrowBarToDown, IconHourglass } from "@tabler/icons-react"

import { SyncPill } from "@/components/sync-pill"
import { depth, hours } from "@/format/figures"
import type { headerFigures } from "@/log/filters"

// Whether the bar has reached its sticky position, read from layout on
// each scroll frame (no writes, so no extra layout).
function useStuck(scroller: string) {
  const bar = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const element = document.querySelector<HTMLElement>(scroller)
    const target = bar.current
    if (!element || !target) return
    let frame = 0
    const update = () => {
      frame = 0
      const top = parseFloat(getComputedStyle(target).top)
      const offset =
        target.getBoundingClientRect().top - element.getBoundingClientRect().top
      setStuck(element.scrollTop > 0 && offset <= top + 0.5)
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
// filters sticks under a cap that fades in the compact line.
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
            {n}
          </span>
          <span className="text-[17px] font-medium text-muted-foreground">
            {n === 1 ? "dive logged" : "dives logged"}
          </span>
        </p>
        <p className="flex flex-wrap items-center gap-x-3.5 pt-0.5 pb-4 text-base text-muted-foreground tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <IconHourglass aria-hidden className="size-[1.15em]" />
            {h} h underwater
          </span>
          {figures.deepest != null && (
            <span className="inline-flex items-center gap-1.5">
              <IconArrowBarToDown aria-hidden className="size-[1.15em]" />
              deepest {depth(figures.deepest)} m
            </span>
          )}
        </p>
      </header>
      <div
        ref={bar}
        data-log-bar
        data-stuck={stuck ? "" : undefined}
        className="sticky top-[calc(2.75rem+env(safe-area-inset-top))] z-10 border-b border-transparent bg-background/85 px-4 backdrop-blur-md transition-[border-color] duration-200 data-stuck:border-border [@media(prefers-reduced-transparency:reduce)]:bg-background"
      >
        {/* The 44px above the bar once stuck: the compact line, opaque
            over what is left of the count (a blur here would see only the
            bar, which is its backdrop root). */}
        <p
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-full flex h-[calc(2.75rem+env(safe-area-inset-top))] items-end bg-background px-4 pt-[env(safe-area-inset-top)] text-[13px] text-muted-foreground tabular-nums opacity-0 transition-opacity duration-200 ease-out in-data-stuck:opacity-100"
        >
          <span className="flex h-11 items-center">
            {n} {n === 1 ? "dive" : "dives"} · {h} h
          </span>
        </p>
        {children}
      </div>
    </>
  )
}
