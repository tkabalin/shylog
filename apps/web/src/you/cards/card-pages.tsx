import { useEffect, useLayoutEffect, useRef, type PointerEvent } from "react"
import {
  animate,
  useMotionValue,
  useReducedMotion,
  type MotionValue,
} from "motion/react"

import { useSize } from "@/chart/size"
import type { Card } from "@/data/db"
import { CardImage } from "@/you/cards/card-image"

// How far a card can be zoomed: an eCard's small print readable on a phone.
const maxScale = 4
// The board's 16 px round the page at rest.
const inset = 16
// Critically damped, as nothing here was thrown: a settle, not a bounce.
const settle = { type: "spring", bounce: 0, duration: 0.4 } as const

// Apple's momentum projection: where a flick would come to rest.
const project = (velocity: number) => ((velocity / 1000) * 0.998) / 0.002

// Past a bound the page follows less the further it goes, as a scroll view
// resists at its end.
function rubberband(value: number, min: number, max: number, size: number) {
  const band = (over: number) => (over * size * 0.55) / (size + 0.55 * over)
  if (value < min) return min - band(min - value)
  if (value > max) return max + band(value - max)
  return value
}

// The inverse: where the finger would be for a value past a bound, so a
// grab during a bounce carries on from there rather than jumping.
function unband(value: number, min: number, max: number, size: number) {
  const raw = (over: number) =>
    (over * size) / (0.55 * Math.max(size - over, 1))
  if (value < min) return min - raw(min - value)
  if (value > max) return max + raw(value - max)
  return value
}

// Scale resists past 4x like a scroll view, and below 1x at half speed.
const bandScale = (raw: number) =>
  raw > maxScale
    ? rubberband(raw, 0, maxScale, maxScale)
    : raw < 1
      ? 1 - (1 - raw) / 2
      : raw
const unbandScale = (shown: number) =>
  shown > maxScale
    ? unband(shown, 0, maxScale, maxScale)
    : shown < 1
      ? 1 - (1 - shown) * 2
      : shown

type Point = { x: number; y: number }
type Gesture =
  // Down, not yet moved far enough to say which.
  | { kind: "pending" | "swipe" | "pan" | "none"; from: Point; time: number }
  // The scale and pan at its start before any banding, and where the fingers
  // and the unbanded pan were last, for the hand-over to a pan or a settle.
  | {
      kind: "pinch"
      distance: number
      mid: Point
      scale: number
      shown: number
      pan: Point
      last: { mid: Point; pan: Point }
    }

// The pages side by side on a track the finger drags, the shown one zoomed
// by a pinch and panned while zoomed. Every motion starts from where the
// page is on screen and takes the finger's speed when it lifts, so any of
// them can be caught mid-way, and every release leaves it settled.
export function CardPages({
  card,
  page,
  onPage,
}: {
  card: Card
  page: number
  onPage: (page: number) => void
}) {
  const stage = useRef<HTMLDivElement>(null)
  const { width, height } = useSize(stage)
  const images = useRef<(HTMLImageElement | null)[]>([])
  const track = useMotionValue(0)
  const scale = useMotionValue(1)
  const panX = useMotionValue(0)
  const panY = useMotionValue(0)
  const reduce = useReducedMotion()
  // Under reduced motion each settle lands at once.
  const spring = reduce ? { duration: 0 } : settle
  const count = card.images.length

  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)
  // The stage's place, read once a gesture starts rather than on each move.
  const rect = useRef<DOMRect | null>(null)
  // Writes the zoom on the next frame, as a gesture's start and end change
  // its layer without changing a value.
  const redraw = useRef(() => {})

  // The values written straight to the elements' transforms without a
  // render: the track as it changes, the zoom once a frame however many of
  // its three values a pinch moved.
  const trackBox = useRef<HTMLDivElement>(null)
  const boxes = useRef<(HTMLDivElement | null)[]>([])
  const shownPage = useRef(page)
  useEffect(() => {
    const slide = (x: number) => {
      if (trackBox.current)
        trackBox.current.style.transform = `translateX(${x}px)`
    }
    let queued = 0
    const write = () => {
      queued = 0
      const box = boxes.current[shownPage.current]
      if (!box) return
      box.style.transform = `translate(${panX.get()}px, ${panY.get()}px) scale(${scale.get()})`
      // Its own layer while a finger or a settle moves it, so the track's
      // isn't repainted each frame, and none at rest, so a zoomed page is
      // drawn again sharp rather than kept as the blurred layer.
      const moving =
        !!gesture.current || [scale, panX, panY].some((v) => v.isAnimating())
      box.style.willChange = moving ? "transform" : ""
    }
    const zoom = () => {
      queued ||= requestAnimationFrame(write)
    }
    redraw.current = zoom
    slide(track.get())
    write()
    const stops = [
      track.on("change", slide),
      ...[scale, panX, panY].flatMap((value) => [
        value.on("change", zoom),
        value.on("animationComplete", zoom),
      ]),
    ]
    return () => {
      cancelAnimationFrame(queued)
      stops.forEach((stop) => stop())
    }
  }, [track, scale, panX, panY])

  // The speed a swipe ended with, for the move to the page it chose.
  const handoff = useRef(0)
  const laidOut = useRef(0)
  // Before paint, so the track never sits still for a frame first.
  useLayoutEffect(() => {
    if (!width) return
    const to = -page * width
    // A new page always starts unzoomed, and the one left goes back too.
    shownPage.current = page
    for (const box of boxes.current) {
      box?.style.removeProperty("transform")
      box?.style.removeProperty("will-change")
    }
    scale.jump(1)
    panX.jump(0)
    panY.jump(0)
    // A page moving already (a dot tapped mid-swipe) carries its speed.
    const velocity = handoff.current || track.getVelocity()
    handoff.current = 0
    // In place on the first layout and a resize, rather than sliding there;
    // a gesture under way when the stage resized starts again.
    if (laidOut.current !== width || reduce) {
      laidOut.current = width
      gesture.current = null
      pointers.current.clear()
      track.jump(to)
      return
    }
    const moving = animate(track, to, { ...settle, velocity })
    return () => moving.stop()
  }, [page, width, reduce, track, scale, panX, panY])

  // Relative to the stage's centre, where an unzoomed page's centre is.
  const at = (event: PointerEvent): Point => {
    const box = (rect.current ??= stage.current!.getBoundingClientRect())
    return {
      x: event.clientX - box.left - box.width / 2,
      y: event.clientY - box.top - box.height / 2,
    }
  }

  // How far the shown page can pan at a scale before its edge comes in.
  const bounds = (at: number) => {
    const image = images.current[page]
    const w = image?.offsetWidth ?? 0
    const h = image?.offsetHeight ?? 0
    return {
      x: Math.max(0, (w * at - width) / 2),
      y: Math.max(0, (h * at - height) / 2),
    }
  }
  const bandPan = (pan: Point, at: number) => {
    const edge = bounds(at)
    return {
      x: rubberband(pan.x, -edge.x, edge.x, width),
      y: rubberband(pan.y, -edge.y, edge.y, height),
    }
  }
  const unbandPan = () => {
    const edge = bounds(scale.get())
    return {
      x: unband(panX.get(), -edge.x, edge.x, width),
      y: unband(panY.get(), -edge.y, edge.y, height),
    }
  }

  const stopAll = () => {
    for (const value of [track, scale, panX, panY]) value.stop()
  }

  // With a mouse: a trackpad's pinch, or Ctrl and the wheel, which browsers
  // send as one, zooms about the pointer. Not passive, to keep the browser's
  // own zoom out of it; read afresh each time, as the page and size change.
  const wheel = useRef<(event: WheelEvent) => void>(null)
  // Through one run of wheel steps, the pan as if nothing held it in, so a
  // page still narrower than the stage (and so centred) ends up under the
  // pointer once it grows past it.
  const wheeling = useRef<{ pan: Point; at: number } | null>(null)
  useEffect(() => {
    wheel.current = (event) => {
      if (!event.ctrlKey || gesture.current) return
      event.preventDefault()
      stopAll()
      const box = stage.current!.getBoundingClientRect()
      const about = {
        x: event.clientX - box.left - box.width / 2,
        y: event.clientY - box.top - box.height / 2,
      }
      const run = wheeling.current
      const from =
        run && event.timeStamp - run.at < 300
          ? run.pan
          : { x: panX.get(), y: panY.get() }
      const now = scale.get()
      const to = Math.min(
        maxScale,
        Math.max(1, now * Math.exp(-event.deltaY / 100))
      )
      const ratio = to / now
      const pan = {
        x: about.x - (about.x - from.x) * ratio,
        y: about.y - (about.y - from.y) * ratio,
      }
      wheeling.current = { pan, at: event.timeStamp }
      const edge = bounds(to)
      scale.set(to)
      panX.set(Math.min(edge.x, Math.max(-edge.x, pan.x)))
      panY.set(Math.min(edge.y, Math.max(-edge.y, pan.y)))
    }
  })
  useEffect(() => {
    const element = stage.current!
    const listener = (event: WheelEvent) => wheel.current?.(event)
    element.addEventListener("wheel", listener, { passive: false })
    return () => element.removeEventListener("wheel", listener)
  }, [])

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()] as [Point, Point]
    // A swipe under way goes back to its page as the pinch takes over.
    if (gesture.current?.kind === "swipe") {
      animate(track, -page * width, spring)
    }
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const pan = unbandPan()
    gesture.current = {
      kind: "pinch",
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      mid,
      scale: unbandScale(scale.get()),
      shown: scale.get(),
      pan,
      last: { mid, pan },
    }
  }

  // From where the page is, unbanded, so a catch mid-motion doesn't jump.
  const start = useRef({ track: 0, pan: { x: 0, y: 0 } })
  const startSingle = (point: Point, time: number, pan = unbandPan()) => {
    gesture.current = {
      kind: scale.get() > 1.01 ? "pan" : "pending",
      from: point,
      time,
    }
    start.current = {
      track: unband(track.get(), -(count - 1) * width, 0, width),
      pan,
    }
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    // Try again is the page's own: capturing its press would send the
    // click to the stage instead.
    if ((event.target as Element).closest("button")) return
    event.currentTarget.setPointerCapture(event.pointerId)
    if (!pointers.current.size) rect.current = null
    pointers.current.set(event.pointerId, at(event))
    stopAll()
    if (pointers.current.size === 1) startSingle(at(event), event.timeStamp)
    else if (pointers.current.size === 2) startPinch()
    redraw.current()
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    const point = at(event)
    pointers.current.set(event.pointerId, point)
    const now = gesture.current
    if (!now) return

    if (now.kind === "pinch") {
      if (pointers.current.size < 2) return
      const [a, b] = [...pointers.current.values()] as [Point, Point]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      // Past the limits it resists rather than stopping dead.
      const next = bandScale((now.scale * distance) / Math.max(now.distance, 1))
      // The point of the page between the fingers stays between them.
      const ratio = next / now.shown
      const pan = {
        x: mid.x - (now.mid.x - now.pan.x) * ratio,
        y: mid.y - (now.mid.y - now.pan.y) * ratio,
      }
      now.last = { mid, pan }
      const shown = bandPan(pan, next)
      scale.set(next)
      panX.set(shown.x)
      panY.set(shown.y)
      return
    }

    const dx = point.x - now.from.x
    const dy = point.y - now.from.y
    // A small dead zone before choosing, so a tap's wobble isn't a swipe.
    if (now.kind === "pending") {
      if (Math.hypot(dx, dy) < 10) return
      // Sideways turns the page (a single page resists, so it still
      // answers); up or down does nothing yet.
      now.kind = Math.abs(dx) > Math.abs(dy) ? "swipe" : "none"
    }
    if (now.kind === "swipe") {
      track.set(
        rubberband(start.current.track + dx, -(count - 1) * width, 0, width)
      )
    } else if (now.kind === "pan") {
      const shown = bandPan(
        { x: start.current.pan.x + dx, y: start.current.pan.y + dy },
        scale.get()
      )
      panX.set(shown.x)
      panY.set(shown.y)
    }
  }

  // Back inside the limits: the scale to 1x–4x about the point the fingers
  // left (a pinch past 4x shrinks back under them), the pan to its bounds,
  // carrying on at the finger's speed when there's room.
  const settleZoom = (momentum: boolean, about: Point = { x: 0, y: 0 }) => {
    const now = scale.get()
    const to = Math.min(maxScale, Math.max(1, now))
    const ratio = to / now
    const edge = bounds(to)
    if (to !== now) animate(scale, to, spring)
    for (const [value, limit, centre] of [
      [panX, edge.x, about.x],
      [panY, edge.y, about.y],
    ] as [MotionValue<number>, number, number][]) {
      const scaled = centre - (centre - value.get()) * ratio
      const inside = Math.min(limit, Math.max(-limit, scaled))
      if (momentum && inside === scaled && !reduce) {
        // Slowing as a scroll does, and springing back off an edge it
        // runs into.
        animate(value, scaled, {
          type: "inertia",
          velocity: value.getVelocity(),
          min: -limit,
          max: limit,
          power: 0.8,
          timeConstant: 325,
          bounceStiffness: 300,
          bounceDamping: 40,
        })
      } else if (inside !== value.get()) {
        animate(value, inside, spring)
      }
    }
  }

  // A finger lifted, or taken by the system (a call, the home bar), which
  // turns no page.
  const release = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (!pointers.current.delete(event.pointerId)) return
    const now = gesture.current
    if (!now) return
    if (now.kind === "pinch") {
      // Two still down pinch on; one left pans on from where it is.
      if (pointers.current.size >= 2) return startPinch()
      const left = [...pointers.current.values()][0]
      if (left) {
        startSingle(left, event.timeStamp, now.last.pan)
        if (gesture.current) gesture.current.kind = "pan"
        return
      }
      gesture.current = null
      return settleZoom(false, now.last.mid)
    }
    if (pointers.current.size) return
    gesture.current = null

    if (now.kind === "swipe" && !cancelled) {
      // To the page a flick is heading for, one at most, at its speed.
      const velocity = track.getVelocity()
      const rest = track.get() + project(velocity)
      const target = Math.max(
        Math.max(0, page - 1),
        Math.min(count - 1, page + 1, Math.round(-rest / width))
      )
      if (target !== page) {
        handoff.current = velocity
        return onPage(target)
      }
      return void animate(track, -page * width, { ...spring, velocity })
    }
    if (
      now.kind === "pending" &&
      !cancelled &&
      event.timeStamp - now.time < 400 &&
      scale.get() <= 1.01
    ) {
      // A tap near either side turns the page, as the board's zones do.
      const x = at(event).x / width
      if (x < -0.2 && page > 0) return onPage(page - 1)
      if (x > 0.2 && page < count - 1) return onPage(page + 1)
    }
    // Whatever the gesture, nothing is left between pages or out of bounds:
    // a hold or a tap can catch a page mid-spring.
    if (track.get() !== -page * width) animate(track, -page * width, spring)
    settleZoom(now.kind === "pan" && !cancelled)
  }

  return (
    <div
      ref={stage}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => {
        release(event, false)
        redraw.current()
      }}
      onPointerCancel={(event) => {
        release(event, true)
        redraw.current()
      }}
      // The page answers every finger itself: the app's pinch is off, and a
      // swipe here mustn't scroll anything behind.
      className="relative min-h-0 flex-1 touch-none overflow-hidden select-none [-webkit-touch-callout:none]"
    >
      <div ref={trackBox} className="flex h-full will-change-transform">
        {card.images.map((hash, i) => (
          <div
            key={`${i} ${hash}`}
            aria-hidden={i !== page}
            className="flex h-full shrink-0 items-center justify-center"
            style={{ width, padding: inset }}
          >
            <div
              ref={(box) => {
                boxes.current[i] = box
              }}
              className="flex max-h-full max-w-full"
            >
              <CardImage
                ref={(image: HTMLImageElement | null) => {
                  images.current[i] = image
                }}
                cardId={card.id}
                n={i}
                hash={hash}
                retry
                alt={`${card.name}, screenshot ${i + 1} of ${count}`}
                style={{
                  maxWidth: Math.max(0, width - inset * 2),
                  maxHeight: Math.max(0, height - inset * 2),
                }}
                className="rounded-[10px] shadow-[0_20px_50px_-20px_rgb(0_0_0/0.8)]"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
