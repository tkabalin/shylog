import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react"
import { flushSync } from "react-dom"
import {
  animate,
  useMotionValue,
  useReducedMotion,
  type AnimationPlaybackControls,
} from "motion/react"

export type Axis = "x" | "y"

// What a finger drags keeps up with it: neighbours make room, and the drop
// settles, with a critically damped spring this short (motion.md).
export const dragSpring = {
  type: "spring",
  visualDuration: 0.12,
  bounce: 0,
} as const

// How far into the visible list a drag starts scrolling it, and how fast
// at the very edge or past it, in pixels a frame at 60 Hz.
const edge = 64
const fastest = 14

// Where a node sits once laid out, along the axis, in the viewport: offsets,
// which leave out the transforms of rows still sliding into place. The
// container must be positioned, so the offsets stop at it.
export function naturalStart(
  node: HTMLElement,
  container: HTMLElement,
  axis: Axis,
  base = container.getBoundingClientRect()[axis === "x" ? "left" : "top"]
) {
  let at = 0
  for (
    let n: HTMLElement | null = node;
    n && n !== container;
    n = n.offsetParent as HTMLElement | null
  )
    at += axis === "x" ? n.offsetLeft : n.offsetTop
  return base + at
}

const sizeOf = (node: HTMLElement, axis: Axis) =>
  axis === "x" ? node.offsetWidth : node.offsetHeight

// The part of `#main` a list shows in: under the page's bar and above the
// tabs, which a drag doesn't move. Its own box would put both edges under
// fixed bars, where a finger seldom goes.
export function mainView(scroller: HTMLElement): [number, number] {
  const box = scroller.getBoundingClientRect()
  const bar = scroller.querySelector("header")?.getBoundingClientRect()
  return [
    bar ? bar.bottom : box.top,
    box.bottom - parseFloat(getComputedStyle(scroller).paddingBottom),
  ]
}

const boxView = (axis: Axis) => (scroller: HTMLElement) => {
  const box = scroller.getBoundingClientRect()
  return (axis === "x" ? [box.left, box.right] : [box.top, box.bottom]) as [
    number,
    number,
  ]
}

// Where a pointer went down, or is now.
export type Press = { pointerId: number; clientX: number; clientY: number }

interface Drag<T> {
  held: T
  // The row's left edge and width when it was lifted, in the viewport.
  left: number
  width: number
  // Settling into place after the finger has let go.
  dropping?: boolean
}

interface Options<T> {
  axis: Axis
  // The list, which never remounts while a drag lasts, so it captures the
  // pointer: a row may be drawn anew (Packing's item into another section).
  container: RefObject<HTMLElement | null>
  scroller: () => HTMLElement | null
  // The scroller's visible edges along the axis; its box by default.
  view?: (scroller: HTMLElement) => [number, number]
  node: (held: T) => HTMLElement | undefined
  // One move of the held row towards where the finger has it, its leading
  // and trailing edges in the viewport; whether it moved.
  step: (held: T, lead: number, trail: number) => boolean
  // Called with where the held row's leading edge is drawn, each move and
  // each frame of the settle.
  place?: (held: T, at: number) => void
  onDrop?: (held: T) => void
  // Once it has settled, or the drag was cut short.
  onSettle?: (held: T) => void
}

// A drag that reorders a list by hand: Motion's Reorder checks a row's slot
// only on pointer moves, so a row held still at an edge as the list scrolled
// dropped in the wrong slot. Here the slot is checked after each scroll too.
export function useDragOrder<T>(options: Options<T>) {
  const { axis, container } = options
  const reduce = useReducedMotion()
  // The held row's leading edge, in the viewport.
  const position = useMotionValue(0)
  const [drag, setDrag] = useState<Drag<T> | null>(null)
  const dragging = useRef<{
    held: T
    pointerId: number
    offset: number
    size: number
  } | null>(null)
  // The row lifted, until it has settled.
  const shown = useRef<{ held: T } | null>(null)
  const settling = useRef<AnimationPlaybackControls | null>(null)
  const pointer = useRef(0)
  // Each render's, read by a drag's handlers, which outlive the render.
  const latest = useRef(options)
  useLayoutEffect(() => {
    latest.current = options
  })

  const end = () => {
    const was = shown.current
    shown.current = null
    if (was) latest.current.onSettle?.(was.held)
    setDrag(null)
  }

  const follow = () => {
    const held = dragging.current
    if (!held) return
    // Kept inside the list's own box, as iOS keeps a dragged row: held past
    // its end, it widened what scrolls the list, so the scroll at that edge
    // ran on into nothing.
    const box = container.current?.getBoundingClientRect()
    const [first, last] = !box
      ? [-Infinity, Infinity]
      : axis === "x"
        ? [box.left, box.right]
        : [box.top, box.bottom]
    const lead = Math.max(
      first,
      Math.min(last - held.size, pointer.current - held.offset)
    )
    position.set(lead)
    // A fast finger can pass several rows between two moves.
    for (let n = 0; n < 50; n++) {
      if (!latest.current.step(held.held, lead, lead + held.size)) break
    }
    latest.current.place?.(held.held, lead)
  }

  useEffect(() => {
    if (!drag || drag.dropping || dragging.current?.held !== drag.held) return
    const list = container.current!
    const scroller = latest.current.scroller()
    let frame = 0
    let last = performance.now()
    // Read once rather than each frame: the drag doesn't move them.
    const [start, stop] = scroller
      ? (latest.current.view ?? boxView(axis))(scroller)
      : [0, axis === "x" ? innerWidth : innerHeight]
    // What a frame's scroll leaves over a whole pixel, which WebKit would
    // round away, stalling the slow edge of the zone.
    let carry = 0
    // Near those edges the list scrolls under the finger, faster the
    // nearer it is, at the same speed whatever the refresh rate, and the
    // held row finds its slot again in the rows that came under it.
    const scroll = (now: number) => {
      const frames = Math.min(now - last, 32) / (1000 / 60)
      last = now
      const from = pointer.current - start
      const to = stop - pointer.current
      const speed =
        from < edge
          ? -fastest * Math.min(1, 1 - from / edge)
          : to < edge
            ? fastest * Math.min(1, 1 - to / edge)
            : 0
      if (scroller && speed) {
        carry += speed * frames
        const whole = Math.trunc(carry)
        carry -= whole
        if (whole) {
          if (axis === "x") scroller.scrollLeft += whole
          else scroller.scrollTop += whole
          follow()
        }
      }
      frame = requestAnimationFrame(scroll)
    }
    frame = requestAnimationFrame(scroll)
    // Only the pointer that lifted the row: a second finger on the list
    // neither moves nor drops it.
    const ours = (event: PointerEvent) =>
      event.pointerId === dragging.current?.pointerId
    const move = (event: PointerEvent) => {
      if (!ours(event)) return
      pointer.current = axis === "x" ? event.clientX : event.clientY
      follow()
    }
    const drop = (event: PointerEvent) => {
      if (!ours(event)) return
      const held = dragging.current!
      dragging.current = null
      cancelAnimationFrame(frame)
      latest.current.onDrop?.(held.held)
      const node = latest.current.node(held.held)
      if (!node || reduce) return end()
      setDrag((was) => was && { ...was, dropping: true })
      const settle = animate(position, naturalStart(node, list, axis), {
        ...dragSpring,
        onUpdate: (at) => latest.current.place?.(held.held, at),
      })
      settling.current = settle
      void settle.then(() => {
        if (settling.current !== settle) return
        settling.current = null
        end()
      })
    }
    list.addEventListener("pointermove", move)
    list.addEventListener("pointerup", drop)
    list.addEventListener("pointercancel", drop)
    list.addEventListener("lostpointercapture", drop)
    return () => {
      cancelAnimationFrame(frame)
      list.removeEventListener("pointermove", move)
      list.removeEventListener("pointerup", drop)
      list.removeEventListener("pointercancel", drop)
      list.removeEventListener("lostpointercapture", drop)
    }
    // Once per drag: the handlers read the latest options through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.held, drag?.dropping])

  // Lifts a row under the pointer that pressed it, if none is held. A row
  // still settling from the last drop gives way at once.
  const grab = (held: T, event: Press) => {
    const list = container.current
    if (dragging.current || !list) return false
    if (settling.current) {
      settling.current.stop()
      settling.current = null
      flushSync(end)
    }
    const node = latest.current.node(held)
    if (!node) return false
    try {
      list.setPointerCapture(event.pointerId)
    } catch {
      // The pointer is already up, as a long press can end as it fires.
      return false
    }
    const box = node.getBoundingClientRect()
    const lead = axis === "x" ? box.left : box.top
    pointer.current = axis === "x" ? event.clientX : event.clientY
    position.set(lead)
    dragging.current = {
      held,
      pointerId: event.pointerId,
      offset: pointer.current - lead,
      size: axis === "x" ? box.width : box.height,
    }
    shown.current = { held }
    // Drawn now, with its release listeners, so a finger let go before the
    // next render (a long press firing late) still drops it.
    flushSync(() => setDrag({ held, left: box.left, width: box.width }))
    return true
  }

  // Sets the row down where it is, as when it can no longer be moved.
  const cancel = () => {
    if (!shown.current) return
    dragging.current = null
    settling.current?.stop()
    settling.current = null
    end()
  }

  // Whether the row is held by a finger now, read in the same task as the
  // lift: a render later, iOS could already be scrolling.
  const holding = (held: T) => dragging.current?.held === held

  return { drag, position, grab, cancel, holding }
}

// A flat list reordered by dragging its rows: the held row moves by
// `translate`, which Motion's layout animations (on `transform`) leave
// alone. Give rows `layout` with a layoutDependency of their place, or `held`.
export function useDragList<V>({
  axis,
  container,
  values,
  keyOf,
  onChange,
  scroller,
  view,
  onLift,
  onDrop,
}: {
  axis: Axis
  // The list, positioned, which never remounts while a drag lasts.
  container: RefObject<HTMLElement | null>
  values: V[]
  keyOf: (value: V) => string
  onChange: (next: V[]) => void
  scroller: () => HTMLElement | null
  view?: (scroller: HTMLElement) => [number, number]
  onLift?: () => void
  onDrop?: () => void
}) {
  const nodes = useRef(new Map<string, HTMLElement>())
  // The order as last set, which a drag reads between renders.
  const latest = useRef(values)
  useLayoutEffect(() => {
    latest.current = values
  }, [values])

  const order = useDragOrder<string>({
    axis,
    container,
    scroller,
    view,
    node: (key) => nodes.current.get(key),
    // Past a neighbour's middle by the held row's leading edge going back
    // or its trailing edge going on, which can't swing back.
    step: (key, lead, trail) => {
      const list = latest.current
      const i = list.findIndex((value) => keyOf(value) === key)
      if (i < 0) return false
      const base =
        container.current!.getBoundingClientRect()[
          axis === "x" ? "left" : "top"
        ]
      const middle = (value: V | undefined) => {
        const node = value && nodes.current.get(keyOf(value))
        return node
          ? naturalStart(node, container.current!, axis, base) +
              sizeOf(node, axis) / 2
          : null
      }
      const before = middle(list[i - 1])
      const after = middle(list[i + 1])
      const to =
        before != null && lead < before
          ? i - 1
          : after != null && trail > after
            ? i + 1
            : i
      if (to === i) return false
      const next = [...list]
      next.splice(to, 0, ...next.splice(i, 1))
      latest.current = next
      // Laid out at once, so the next step measures the new places.
      flushSync(() => onChange(next))
      return true
    },
    place: (key, at) => {
      const node = nodes.current.get(key)
      if (!node) return
      const by = at - naturalStart(node, container.current!, axis)
      node.style.translate = axis === "x" ? `${by}px 0` : `0 ${by}px`
    },
    onSettle: (key) => {
      const node = nodes.current.get(key)
      if (node) node.style.translate = ""
    },
    onDrop: () => onDrop?.(),
  })

  // Each render's, read by the stable functions the rows hold.
  const self = useRef({ order, onLift })
  useLayoutEffect(() => {
    self.current = { order, onLift }
  })
  // The same functions for the list's life, so rows can hold them.
  const [rows] = useState(() => ({
    // For a row's ref callback, returning its cleanup: keeps the node for
    // as long as it holds the key.
    register: (key: string, node: HTMLElement) => {
      nodes.current.set(key, node)
      return () => {
        if (nodes.current.get(key) === node) nodes.current.delete(key)
      }
    },
    start: (key: string, press: Press) => {
      if (!self.current.order.grab(key, press)) return false
      self.current.onLift?.()
      return true
    },
    holding: (key: string) => self.current.order.holding(key),
  }))

  return {
    held: order.drag?.held,
    dropping: !!order.drag?.dropping,
    rows,
    cancel: () => self.current.order.cancel(),
  }
}
