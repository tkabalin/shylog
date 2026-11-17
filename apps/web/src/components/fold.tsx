import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { reduced } from "@/lib/motion"

// The room moves while the content is invisible and the content fades while
// its room is open, so it is never seen clipped; on the drawer's curve, as
// --ease-in-out lurched. A list's row, seen often, folds within 300 ms.
const timings = {
  block: { roomMs: 250, fadeMs: 150, ease: "--ease-drawer", together: false },
  row: { roomMs: 200, fadeMs: 100, ease: "--ease-drawer", together: false },
  // A pill in a row (the Log's Clear) fades as the pills after it slide,
  // as it never shows clipped.
  pill: { roomMs: 200, fadeMs: 200, ease: "--ease-out", together: true },
}

// Read once each: the tokens never change while the app runs.
const curves = new Map<string, string>()
export function curve(name: string) {
  let value = curves.get(name)
  if (value == null) {
    value = getComputedStyle(document.documentElement).getPropertyValue(name)
    curves.set(name, value)
  }
  return value
}

type Moving = {
  element: HTMLElement
  x: number
  y: number
  left: number
  top: number
}
type Box = { element: HTMLElement; shift: number; radius: number }

// What the fold's room moves up to the page's scroller (across, in a row of
// pills), and the cards it sits in, whose bottom edge moves with it: what
// is on screen, measured once with the fold and once without.
function measure(fold: HTMLElement) {
  const after: HTMLElement[] = []
  const before: HTMLElement[] = []
  const boxes: HTMLElement[] = []
  const scrolled: [HTMLElement, number, number][] = []
  for (let node = fold; node.parentElement; node = node.parentElement) {
    const parent = node.parentElement
    let list = before
    for (const sibling of parent.children)
      if (sibling === node) list = after
      else if (sibling instanceof HTMLElement) list.push(sibling)
    if (parent.dataset.slot === "card") boxes.push(parent)
    if (parent.scrollTop || parent.scrollLeft)
      scrolled.push([parent, parent.scrollTop, parent.scrollLeft])
    if (parent.id === "main") break
  }
  const rects = (list: HTMLElement[]) =>
    list.map((element) => element.getBoundingClientRect())
  const shown = rects(after)
  const heights = boxes.map((element) => element.offsetHeight)
  const display = fold.style.display
  fold.style.display = "none"
  const hidden = rects(after)
  const shrunk = boxes.map((element) => element.offsetHeight)
  // A scroller at its end is pulled back by the room, which moves what
  // comes before the fold too. Put back, as hiding it here was only a look.
  const clamped = scrolled.some(
    ([element, top, left]) =>
      element.scrollTop !== top || element.scrollLeft !== left
  )
  // A card's top would move with what precedes it, which its edge can't
  // follow, so it only fades and its room shuts at the end.
  const still = clamped && boxes.length > 0
  const pulled = clamped && !still ? rects(before) : []
  fold.style.display = display
  for (const [element, top, left] of scrolled) {
    element.scrollTop = top
    element.scrollLeft = left
  }
  if (still) return { moving: [], boxes: [] }
  const moving: Moving[] = []
  const add = (list: HTMLElement[], from: DOMRect[], to: DOMRect[]) =>
    list.forEach((element, i) => {
      const { top, bottom, left } = from[i]!
      const x = left - to[i]!.left
      const y = top - to[i]!.top
      if (
        (x || y) &&
        Math.min(top, top - y) < innerHeight &&
        Math.max(bottom, bottom - y) > 0
      )
        moving.push({ element, x, y, left, top })
    })
  add(after, shown, hidden)
  if (pulled.length) add(before, rects(before), pulled)
  return {
    moving,
    boxes: boxes.map((element, i) => ({
      element,
      shift: heights[i]! - shrunk[i]!,
      radius: parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0,
    })),
  }
}

// Where a slide or fade stopped part-way left things, read as it stops, so
// one starting in the same commit (a toggle back mid-way) goes on from
// there rather than jumping. Forgotten once the commit's task is done.
type Stopped = {
  left?: number
  top?: number
  bottom?: number
  opacity?: number
}
const stopped = new Map<Element, Stopped>()
export function remember(element: Element, at: Stopped) {
  if (!stopped.size) queueMicrotask(() => stopped.clear())
  stopped.set(element, { ...stopped.get(element), ...at })
}
export const stoppedAt = (element: Element) => stopped.get(element)

// A card's sliding edge, shared by every slide on it at once: the latest
// drives it from where it is, and its copy goes as the last one ends.
type Edge = { cap: HTMLElement; moving: Animation[]; slides: number }
const edges = new WeakMap<HTMLElement, Edge>()

// A card's bottom edge moves with what follows it: the card is clipped at
// the edge, and a copy of its rounded bottom and ring rides along on the
// edge, as clipping alone leaves the card open there. Returns the undo.
function slideBox(
  { element, radius }: Box,
  [from, to]: [number, number],
  timing: KeyframeAnimationOptions,
  played: Animation[]
) {
  // Its copy's bottom is 1px below the edge, where the ring is.
  const offset = (bottom: number) =>
    element.getBoundingClientRect().bottom + 1 - bottom
  let edge = edges.get(element)
  let start = from
  if (edge) {
    // The room this slide adds or takes is already laid out under it.
    start = offset(edge.cap.getBoundingClientRect().bottom) + from
    edge.moving.forEach((one) => one.cancel())
  } else {
    const was = stoppedAt(element)?.bottom
    if (was != null) start = offset(was)
    const style = getComputedStyle(element)
    // Drawn with a border where the card's ring is, 1px outside it, and no
    // top, so nothing crosses the card. Beside the card, not in it, where
    // its rows' :first-child and divide-y styles would find it.
    const cap = document.createElement("div")
    Object.assign(cap.style, {
      position: "absolute",
      left: "0",
      top: "0",
      zIndex: "1",
      width: `${element.offsetWidth + 2}px`,
      height: `${radius + 1}px`,
      background: style.backgroundColor,
      backgroundClip: "padding-box",
      border: `1px solid ${style.getPropertyValue("--tw-ring-color")}`,
      borderTop: "none",
      borderRadius: `0 0 ${radius + 1}px ${radius + 1}px`,
      pointerEvents: "none",
    })
    element.before(cap)
    const box = element.getBoundingClientRect()
    const at = cap.getBoundingClientRect()
    cap.style.left = `${box.left - 1 - at.left}px`
    cap.style.top = `${box.bottom - radius - at.top}px`
    edge = { cap, moving: [], slides: 0 }
    edges.set(element, edge)
  }
  const mine = edge
  mine.slides++
  const clip = (at: number) =>
    `inset(-1px -1px ${at - 1}px -1px round ${radius + 1}px)`
  mine.moving = [
    element.animate({ clipPath: [clip(start), clip(to)] }, timing),
    mine.cap.animate(
      { transform: [`translateY(${-start}px)`, `translateY(${-to}px)`] },
      timing
    ),
  ]
  played.push(...mine.moving)
  return (keep: boolean) => {
    if (keep)
      remember(element, { bottom: mine.cap.getBoundingClientRect().bottom })
    if (--mine.slides) return
    edges.delete(element)
    mine.cap.remove()
  }
}

// Slides what `fold`'s room moves, from where it was without it as it opens,
// to there as it shuts, or on from where a stopped slide left it; the room
// never animates, so nothing lays out. `stop` remembers where it was.
export function slideAfter(
  fold: HTMLElement,
  opening: boolean,
  timing: KeyframeAnimationOptions
) {
  const { moving, boxes } = measure(fold)
  const played: Animation[] = []
  const undo: ((keep: boolean) => void)[] = []
  for (const { element, x, y, left, top } of moving) {
    const was = stoppedAt(element)
    const [fromX, fromY] =
      was?.left != null && was.top != null
        ? [was.left - left, was.top - top]
        : opening
          ? [-x, -y]
          : [0, 0]
    const [toX, toY] = opening ? [0, 0] : [-x, -y]
    played.push(
      // Added to any other slide, as rows revealed together each move
      // what follows them by their own room.
      element.animate(
        {
          transform: [
            `translate(${fromX}px, ${fromY}px)`,
            `translate(${toX}px, ${toY}px)`,
          ],
        },
        { ...timing, fill: "both", composite: "add" }
      )
    )
  }
  for (const one of boxes)
    undo.push(
      slideBox(
        one,
        opening ? [one.shift, 0] : [0, one.shift],
        { ...timing, fill: "both" },
        played
      )
    )
  let ended = false
  const end = (keep: boolean) => {
    if (ended) return
    ended = true
    if (keep)
      for (const { element } of moving) {
        const { left, top } = element.getBoundingClientRect()
        remember(element, { left, top })
      }
    played.forEach((one) => one.cancel())
    undo.forEach((one) => one(keep))
    undo.length = 0
  }
  // Cleared once still, so a later slide measures what follows untranslated.
  // A card's edge another slide took over counts as still.
  if (opening)
    void Promise.all(
      played.map((one) => one.finished.catch(() => undefined))
    ).then(() => end(false))
  return { played, stop: () => end(true), end: () => end(false) }
}

// Something that comes or goes in a column (You's alerts, a dive's offline
// note) unfolds into place and folds away, so the page never jumps under
// the thumb; reduced motion only fades. `appear` is false when drawn open
// with the page. Its room snaps open or shut once while what follows slides.
export function Fold({
  open,
  appear,
  timing = "block",
  onFolded,
  className,
  children,
}: {
  open: boolean
  appear: boolean
  timing?: keyof typeof timings
  // Once it has folded away, to unmount it.
  onFolded?: () => void
  className?: string
  children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const drawn = useRef(open)
  const mounted = useRef(false)
  const folded = useRef(onFolded)
  useLayoutEffect(() => {
    folded.current = onFolded
  })

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const first = !mounted.current
    mounted.current = true
    if (open) el.style.display = ""
    // Drawn closed, it takes no room from the start.
    else if (!drawn.current) {
      el.style.display = "none"
      return
    }
    drawn.current = true
    if (open && first && !appear) return
    const { roomMs, fadeMs, ease, together } = timings[timing]
    const out = curve("--ease-out")
    const still = reduced()
    const room = { duration: roomMs, easing: curve(ease) }
    // Folded away, it reads as opaque, but was last seen at nothing.
    const keep = () =>
      remember(el, {
        opacity:
          el.style.display === "none"
            ? 0
            : Number(getComputedStyle(el).opacity),
      })
    if (together) {
      // From where a toggle back mid-way left it.
      const from = stoppedAt(el)?.opacity ?? (open ? 0 : 1)
      const fade = el.animate(
        { opacity: [from, open ? 1 : 0] },
        { duration: fadeMs, easing: out, fill: "forwards" }
      )
      const slid = still ? null : slideAfter(el, open, room)
      return settle(fade, slid, fadeMs)
    }
    if (open) {
      // Opens at once under the room's slide, then fades in.
      const fade = el.animate(
        { opacity: [0, 1] },
        still
          ? { duration: fadeMs, easing: out }
          : { duration: fadeMs, delay: roomMs, easing: out, fill: "backwards" }
      )
      const slid = still ? null : slideAfter(el, true, room)
      return () => {
        keep()
        fade.cancel()
        slid?.stop()
      }
    }
    // Fades, then what follows slides up over the empty room, which shuts
    // once at the end. Closed part-way open, it fades from where it was,
    // and at once if it hadn't shown yet.
    const from = stoppedAt(el)?.opacity ?? 1
    const fading = fadeMs * from
    const total = still ? fading : fading + roomMs
    const fade = el.animate(
      [
        { opacity: from, easing: out },
        { opacity: 0, offset: total ? fading / total : 1 },
        { opacity: 0 },
      ],
      { duration: total, fill: "forwards" }
    )
    const slid = still
      ? null
      : slideAfter(el, false, { ...room, delay: fading })
    return settle(fade, slid, total)

    // Opened, it is left as it is; closed, it takes no room once still.
    function settle(
      fade: Animation,
      slid: ReturnType<typeof slideAfter> | null,
      total: number
    ) {
      const done = () => {
        clearTimeout(late)
        if (!open) el!.style.display = "none"
        fade.cancel()
        slid?.end()
        if (!open) folded.current?.()
      }
      fade.onfinish = done
      // A hidden page draws no frames, so its fade never ends.
      const late = setTimeout(() => {
        if (document.hidden) done()
      }, total + 100)
      return () => {
        clearTimeout(late)
        keep()
        fade.cancel()
        slid?.stop()
      }
    }
  }, [open, appear, timing])

  return (
    <div ref={box} inert={!open} className={className}>
      {children}
    </div>
  )
}

// Rows a tap adds to a long list (You's 50 more, Statistics' Show all)
// appear at full height and fade in, rather than easing their room open:
// fifty rows growing moved and repainted everything below on each frame.
export function FadeIn({
  instant = false,
  className,
  children,
}: {
  instant?: boolean
  className?: string
  children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const [animate] = useState(!instant)
  useLayoutEffect(() => {
    if (!animate) return
    const fade = box.current?.animate(
      { opacity: [0, 1] },
      { duration: 200, easing: curve("--ease-out") }
    )
    return () => fade?.cancel()
  }, [animate])
  return (
    <div ref={box} className={className}>
      {children}
    </div>
  )
}
