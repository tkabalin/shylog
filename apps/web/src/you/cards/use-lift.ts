import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react"
import { useDragControls } from "motion/react"

// How long a press holds before the item lifts, and how far a finger can
// drift meanwhile before it counts as a scroll instead.
const holdMs = 350
const slop = 8

// A Reorder item a long press lifts to drag, so a plain swipe still
// scrolls what holds it. A mouse scrolls nothing by dragging, so its drag
// lifts the item at once. Spread `item` on the Reorder.Item and give it
// `ref`; `lifted` is for the look.
export function useLift() {
  const controls = useDragControls()
  const [lifted, setLifted] = useState(false)
  // Read by the touch listener, which the lift must reach in the same task:
  // a render later, iOS could already be scrolling.
  const liftedNow = useRef(false)
  // Whether this press lifted the item, so the click its release sends
  // doesn't also open what the item links to.
  const moved = useRef(false)
  const lift = (on: boolean) => {
    liftedNow.current = on
    if (on) moved.current = true
    setLifted(on)
  }
  const hold = useRef<{
    timer?: number
    x: number
    y: number
    mouse: boolean
  } | null>(null)

  const cancel = () => {
    if (hold.current) clearTimeout(hold.current.timer)
    hold.current = null
  }

  // Once lifted, a finger's move drags rather than scrolls. Not passive, so
  // it can stop the scroll; React's touch handlers are. An item removed
  // mid-press drops its hold, so no drag starts on one gone.
  const [node, setNode] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!node) return
    const stop = (event: TouchEvent) => {
      if (liftedNow.current) event.preventDefault()
    }
    node.addEventListener("touchmove", stop, { passive: false })
    return () => {
      node.removeEventListener("touchmove", stop)
      cancel()
    }
  }, [node])

  const item = {
    dragListener: false,
    dragControls: controls,
    onDragEnd: () => lift(false),
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      if ((event.target as Element).closest("button")) return
      const native = event.nativeEvent
      cancel()
      moved.current = false
      const mouse = event.pointerType === "mouse"
      hold.current = {
        x: event.clientX,
        y: event.clientY,
        mouse,
        timer: mouse
          ? undefined
          : window.setTimeout(() => {
              hold.current = null
              lift(true)
              controls.start(native)
            }, holdMs),
      }
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const start = hold.current
      if (
        !start ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) <= slop
      )
        return
      cancel()
      if (start.mouse) {
        lift(true)
        controls.start(event.nativeEvent)
      }
    },
    // A press the system takes (a scroll it started) drops the item too;
    // the drag never began, so no drag end would.
    onPointerUp: () => {
      cancel()
      lift(false)
      // After the click the release sends, so a later key press opens it.
      setTimeout(() => (moved.current = false))
    },
    onPointerCancel: () => {
      cancel()
      lift(false)
    },
    onClickCapture: (event: MouseEvent) => {
      if (!moved.current) return
      moved.current = false
      event.preventDefault()
      event.stopPropagation()
    },
    onContextMenu: (event: MouseEvent) => event.preventDefault(),
  }
  // The state's setter, stable across renders, so React never detaches it.
  return { item, ref: setNode, lifted }
}
