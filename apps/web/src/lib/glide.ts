import { useLayoutEffect, useRef, type RefObject } from "react"
import { useRouter } from "@tanstack/react-router"

import { curve } from "@/components/fold"
import { reduced } from "@/lib/motion"

// FLIP for a tool's table: the page scrolls at once to keep the key row
// still, and each `data-glide` row slides from where it was, so the scale
// moves past it. A row mid-slide counts from where it is, so taps can chain.
export const glideDuration = 260
const fadeDuration = 200

// When a row should change its look, as a line or row gliding over it
// reaches it: `share` is how far along the glide that is, 0 to 1, and the
// answer is the delay in ms at which the slide's curve has gone that far.
export function crossingDelay(share: number) {
  if (reduced() || !(share > 0)) return 0
  if (share >= 1) return glideDuration
  // --ease-out's control points, cubic-bezier(0.23, 1, 0.32, 1): x is
  // time, y is distance.
  const bezier = (t: number, a: number, b: number) =>
    3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3
  let low = 0
  let high = 1
  for (let i = 0; i < 24; i++) {
    const t = (low + high) / 2
    if (bezier(t, 1, 1) < share) low = t
    else high = t
  }
  return Math.round(bezier((low + high) / 2, 0.23, 0.32) * glideDuration)
}

const rowsIn = (list: HTMLElement) =>
  list.querySelectorAll<HTMLElement>("[data-glide]")

function scrollerOf(list: HTMLElement) {
  for (let node = list.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === "auto" || overflowY === "scroll") return node
  }
  return document.documentElement
}

// Where the list can be seen: below the controls and the table's header,
// which stick at the top, and above the tab bar the page pads for. `top`
// is where the header's bottom sits once it has stuck.
function view(list: HTMLElement, header: HTMLElement | null) {
  const scroller = scrollerOf(list)
  const box = scroller.getBoundingClientRect()
  const style = getComputedStyle(scroller)
  const seen = window.visualViewport
  const stuck = header
    ? box.top +
      Number.parseFloat(getComputedStyle(header).top) +
      header.offsetHeight
    : box.top
  return {
    scroller,
    top: Number.isNaN(stuck) ? box.top : stuck,
    // Where the header is now, stuck or not yet.
    shown: header?.getBoundingClientRect().bottom ?? box.top,
    // Above the keyboard too, which covers the page without shrinking it.
    bottom: Math.min(
      box.bottom - Number.parseFloat(style.paddingBottom || "0"),
      seen ? seen.offsetTop + seen.height : Infinity
    ),
  }
}

// Started on the tap's own frame: a new animation otherwise waits a frame
// or two for its start time, holding still while the colours already move.
function play(row: HTMLElement, keyframes: Keyframe[], duration: number) {
  const animation = row.animate(keyframes, {
    duration,
    easing: curve("--ease-out"),
  })
  animation.startTime = document.timeline.currentTime
}

export function useGlide(
  // Around the rows.
  rows: RefObject<HTMLElement | null>,
  // The table's header, stuck over the rows as the page scrolls.
  header: RefObject<HTMLElement | null>,
  // The row to keep in the middle of the list, by its key.
  centre: string | undefined,
  // Changes whenever the list is rearranged.
  version: string
) {
  const before = useRef<Map<string, number> | null>(null)
  const first = useRef(true)
  const router = useRouter()
  const recentre = useRef<() => void>(() => {})

  // Again once the router has scrolled the new screen to its top, which it
  // does after the opening layout has run.
  useLayoutEffect(() => {
    const stop = router.subscribe("onRendered", () => {
      stop()
      recentre.current()
    })
    return stop
  }, [router])

  useLayoutEffect(() => {
    const list = rows.current
    if (!list) return
    const was = before.current
    before.current = null
    const shown = [...rowsIn(list)]
    // Ended at once, so the places read below are the new layout's own.
    // Only the rows' own slides: the cells' colour switches keep running.
    for (const animation of list.getAnimations({ subtree: true }))
      if (
        animation.effect instanceof KeyframeEffect &&
        animation.effect.target instanceof HTMLElement &&
        animation.effect.target.dataset.glide !== undefined
      )
        animation.cancel()
    const target = centre
      ? list.querySelector<HTMLElement>(`[data-glide="${centre}"]`)
      : null
    const centring = () => {
      if (!target) return
      const { scroller, top, bottom } = view(list, header.current)
      const row = target.getBoundingClientRect()
      scroller.scrollBy({
        top: row.top - top - (bottom - top - row.height) / 2,
        behavior: "instant",
      })
    }
    centring()
    recentre.current = centring
    const opened = first.current
    first.current = false
    if (opened || !was || reduced()) return
    // Every place read before any row animates, so the browser lays the
    // list out once rather than once a row. In the order they show, which
    // CSS `order` can make different from the document's.
    const box = view(list, header.current)
    const places = shown
      .map((row) => {
        const { top, height } = row.getBoundingClientRect()
        const key = row.dataset.glide!
        const from = was.get(key) ?? was.get(row.dataset.glideFrom ?? "")
        return { row, now: top, height, from }
      })
      .sort((a, b) => a.now - b.now)
    // A row that wasn't there moves with the row above it, so a row added
    // at the end comes in with the list rather than over it.
    let above = 0
    for (const { row, now, height, from } of places) {
      const offset = from === undefined ? above : from - now
      above = offset
      // Rows that never cross the visible list stay still, as nobody would
      // see them move and each slide costs a layer.
      const low = Math.min(now + offset, now)
      const high = Math.max(now + offset, now) + height
      if (high <= box.shown || low >= box.bottom) continue
      if (from === undefined) {
        // Out from behind the row named in `data-glide-from`, or from just
        // smaller where it lands.
        play(
          row,
          [
            { opacity: 0, transform: `translateY(${offset}px) scale(0.97)` },
            { opacity: 1, transform: "none" },
          ],
          fadeDuration
        )
      } else if (Math.abs(offset) >= 0.5) {
        play(
          row,
          [
            { transform: `translateY(${offset}px)` },
            { transform: "translateY(0)" },
          ],
          glideDuration
        )
      }
    }
    // Only a new arrangement moves; the centre row alone doesn't scroll.
  }, [version]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // Called just before the change that rearranges the list.
    capture() {
      const list = rows.current
      if (!list) return
      const places = new Map<string, number>()
      for (const row of rowsIn(list))
        places.set(row.dataset.glide!, row.getBoundingClientRect().top)
      before.current = places
    },
    // How much of the list shows at once, to tell a jump too far to follow.
    height() {
      const list = rows.current
      if (!list) return Infinity
      const { top, bottom } = view(list, header.current)
      return bottom - top
    },
  }
}
