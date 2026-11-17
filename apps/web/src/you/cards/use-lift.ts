import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react"

import type { Press } from "@/lib/drag-order"

// How long a press holds before the item lifts, and how far a finger can
// drift meanwhile before it counts as a scroll instead.
const holdMs = 350
const slop = 8

// A row of a `useDragList` a long press lifts to drag, so a plain swipe
// still scrolls what holds it. A mouse scrolls nothing by dragging, so its
// drag lifts the row at once. Spread `item` on the row and give it `ref`.
export function useLift(
  key: string,
  rows: {
    // Lifts the row under the press; whether it did.
    start: (key: string, press: Press) => boolean
    // Whether the row is held now.
    holding: (key: string) => boolean
  }
) {
  // Whether this press lifted the item, so the click its release sends
  // doesn't also open what the item links to.
  const moved = useRef(false)
  const lift = (press: Press) => {
    if (!rows.start(key, press)) return
    moved.current = true
    // Forgotten after the click the release sends, so a later key press
    // opens it. The list has the pointer, so the row never sees it go up.
    const done = () => {
      removeEventListener("pointerup", done, true)
      removeEventListener("pointercancel", done, true)
      setTimeout(() => (moved.current = false))
    }
    addEventListener("pointerup", done, true)
    addEventListener("pointercancel", done, true)
  }
  const hold = useRef<{ timer?: number; off: () => void } | null>(null)

  const cancel = () => {
    if (hold.current) {
      clearTimeout(hold.current.timer)
      hold.current.off()
    }
    hold.current = null
  }

  // Once lifted, a finger's move drags rather than scrolls. Not passive, so
  // it can stop the scroll; React's touch handlers are. An item removed
  // mid-press drops its hold, so no drag starts on one gone.
  const [node, setNode] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!node) return
    const stop = (event: TouchEvent) => {
      if (rows.holding(key)) event.preventDefault()
    }
    node.addEventListener("touchmove", stop, { passive: false })
    return () => {
      node.removeEventListener("touchmove", stop)
      cancel()
    }
    // The rows' functions are the same for the list's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, key])

  const item = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      if ((event.target as Element).closest("button, [data-grip]")) return
      const { pointerId, clientX, clientY } = event
      cancel()
      moved.current = false
      const mouse = event.pointerType === "mouse"
      // Watched on the window, as a quick mouse can leave a narrow page
      // in one move, before it has gone far enough to lift it.
      const move = (next: globalThis.PointerEvent) => {
        if (
          next.pointerId !== pointerId ||
          Math.hypot(next.clientX - clientX, next.clientY - clientY) <= slop
        )
          return
        cancel()
        if (mouse) lift(next)
      }
      // Released, or taken by the system (a scroll it started), before
      // the hold ran out.
      const end = (next: globalThis.PointerEvent) => {
        if (next.pointerId === pointerId) cancel()
      }
      addEventListener("pointermove", move)
      addEventListener("pointerup", end)
      addEventListener("pointercancel", end)
      hold.current = {
        off: () => {
          removeEventListener("pointermove", move)
          removeEventListener("pointerup", end)
          removeEventListener("pointercancel", end)
        },
        timer: mouse
          ? undefined
          : window.setTimeout(() => {
              cancel()
              lift({ pointerId, clientX, clientY })
            }, holdMs),
      }
    },
    onClickCapture: (event: MouseEvent) => {
      if (!moved.current) return
      moved.current = false
      event.preventDefault()
      event.stopPropagation()
    },
    onContextMenu: (event: MouseEvent) => event.preventDefault(),
  }
  // A grip lifts at once, with no hold, as a handle does in other apps: a
  // finger on it means to drag, never to scroll. Give it `data-grip`.
  const grab = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    cancel()
    moved.current = false
    lift(event)
  }
  // The state's setter, stable across renders, so React never detaches it.
  return { item, ref: setNode, grab }
}
