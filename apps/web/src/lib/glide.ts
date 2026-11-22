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
  // --ease-out's control points, read from the token the slide plays on:
  // x is time, y is distance.
  const points = curve("--ease-out")
    .match(/-?[\d.]+/g)
    ?.map(Number)
  if (points?.length !== 4) return Math.round(share * glideDuration)
  const [x1, y1, x2, y2] = points as [number, number, number, number]
  const bezier = (t: number, a: number, b: number) =>
    3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3
  let low = 0
  let high = 1
  for (let i = 0; i < 24; i++) {
    const t = (low + high) / 2
    if (bezier(t, y1, y2) < share) low = t
    else high = t
  }
  return Math.round(bezier((low + high) / 2, x1, x2) * glideDuration)
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

// When a tap's slides and colour holds start: on its own frame, so a slide
// moves on the first one, but no more than a frame back, or a slow render
// skips the front of the glide. Clocks a second or more apart aren't the
// same clock (DevTools slowing animations), so the frame's is kept then.
function startOf() {
  const frame = document.timeline.currentTime as number
  const now = performance.now()
  return now - frame < 1000 ? Math.max(frame, now - 1000 / 60) : frame
}

// A cell marked `data-switch="<key>"` that changes its look as a row or line
// glides past it, `data-switch-at` ms in: until then it keeps the look it
// had, held by an animation on the slides' own clock. With
// `data-switch-blank`, its new text stays hidden until then too.
const switchesIn = (list: HTMLElement) =>
  list.querySelectorAll<HTMLElement>("[data-switch]")

type Look = { color: string; fontWeight: string }

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
  const before = useRef<{
    places: Map<string, number>
    looks: Map<string, Look>
  } | null>(null)
  const first = useRef(true)
  const router = useRouter()
  const recentre = useRef<() => void>(() => {})
  // The slides and holds this hook started, so a tap ends them without
  // looking through every animation on the page.
  const playing = useRef(new Set<Animation>())

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
    // Ended at once, so the places read below are the new layout's own, as
    // are the looks the holds start from.
    for (const animation of playing.current) animation.cancel()
    playing.current.clear()
    const play = (
      element: HTMLElement,
      keyframes: Keyframe[],
      timing: KeyframeAnimationOptions
    ) => {
      const animation = element.animate(keyframes, {
        ...timing,
        fill: "backwards",
      })
      playing.current.add(animation)
      animation.onfinish = () => playing.current.delete(animation)
    }
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
    // for the NDL table's lines and zones isn't the document's.
    const box = view(list, header.current)
    // The key row came from further than the list shows, the page having
    // been scrolled away from it: it lands at once, as a far jump does,
    // rather than the whole table sweeping across the screen.
    const anchor = centre === undefined ? undefined : was.places.get(centre)
    if (
      target &&
      anchor !== undefined &&
      Math.abs(anchor - target.getBoundingClientRect().top) >
        box.bottom - box.top
    )
      return
    const places = shown
      .map((row) => {
        const { top, height } = row.getBoundingClientRect()
        const key = row.dataset.glide!
        const from =
          was.places.get(key) ?? was.places.get(row.dataset.glideFrom ?? "")
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
          { duration: fadeDuration, easing: curve("--ease-out") }
        )
      } else if (Math.abs(offset) >= 0.5) {
        play(
          row,
          [
            { transform: `translateY(${offset}px)` },
            { transform: "translateY(0)" },
          ],
          { duration: glideDuration, easing: curve("--ease-out") }
        )
      }
    }
    for (const cell of switchesIn(list)) {
      const at = Number(cell.dataset.switchAt)
      const look = was.looks.get(cell.dataset.switch!)
      if (!(at > 0) || !look) continue
      const held =
        cell.dataset.switchBlank === undefined ? look : { ...look, opacity: 0 }
      play(cell, [held, held], { duration: at })
    }
    // Once all of them are made, after the reads above, so that work doesn't
    // eat into the glide either.
    const start = startOf()
    for (const animation of playing.current) animation.startTime = start
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
      // As they show, a hold from the last tap included.
      const looks = new Map<string, Look>()
      for (const cell of switchesIn(list)) {
        const { color, fontWeight } = getComputedStyle(cell)
        looks.set(cell.dataset.switch!, { color, fontWeight })
      }
      before.current = { places, looks }
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
