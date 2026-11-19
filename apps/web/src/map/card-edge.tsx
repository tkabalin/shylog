import {
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"

import { useMapFrame } from "./basemap"
import { cardWidth, clampWidth, narrowest, widest } from "./card-width"

// The width of whichever card is over the desktop's map, and the handle on
// its right edge that sets it. Held while the edge is dragged, and stored
// once it's let go.
export function useCardWidth() {
  const { container } = useMapFrame()
  const stored = useSyncExternalStore(cardWidth.subscribe, cardWidth.get)
  const [dragged, setDragged] = useState<number>()
  const width = dragged ?? stored
  // The most a narrow window leaves it (60% of the map), so the handle
  // reports and steps from the width drawn, not the one stored.
  const [cap, setCap] = useState(widest)
  const drawn = Math.min(width, cap)
  useLayoutEffect(() => {
    if (!container) return
    const report = () => {
      const map = container.clientWidth
      setCap(Math.min(map - 24, map * 0.6))
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(container)
    return () => observer.disconnect()
  }, [container])
  // A drag on the edge widens it, or the arrow keys on the handle, with the
  // cursor kept as the edge's once it stops at a limit.
  const resize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget
    // From the width drawn, which a narrow window may hold under the one
    // stored, so the edge moves with the first pixel of the drag.
    const from = event.clientX - drawn
    let to = drawn
    handle.setPointerCapture(event.pointerId)
    document.documentElement.style.cursor = "col-resize"
    const move = (moved: PointerEvent) => {
      to = clampWidth(moved.clientX - from)
      setDragged(to)
    }
    const end = () => {
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", end)
      handle.removeEventListener("pointercancel", end)
      document.documentElement.style.cursor = ""
      cardWidth.set(to)
      setDragged(undefined)
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", end)
    handle.addEventListener("pointercancel", end)
  }
  const nudge = (event: ReactKeyboardEvent) => {
    const step = { ArrowLeft: -16, ArrowRight: 16 }[event.key]
    if (!step) return
    event.preventDefault()
    cardWidth.set(clampWidth(drawn + step))
  }
  // shadcn's resizable handle with its grip: a pill on the card's right
  // edge, halfway down, that says the edge moves; a shade darker than
  // shadcn's, to read over the map. It reaches out from the edge, clear of
  // the card's scrollbar.
  const edge = (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize"
      aria-valuemin={narrowest}
      aria-valuemax={widest}
      aria-valuenow={drawn}
      tabIndex={0}
      onPointerDown={resize}
      onKeyDown={nudge}
      className="group/edge absolute inset-y-3 -right-2.5 flex w-2.5 cursor-col-resize touch-none items-center outline-none"
    >
      <div className="-ml-0.5 h-6 w-1 rounded-lg bg-ring transition-colors group-hover/edge:bg-muted-foreground group-focus-visible/edge:bg-muted-foreground group-focus-visible/edge:ring-3 group-focus-visible/edge:ring-ring/50 group-active/edge:bg-foreground" />
    </div>
  )
  return { width, edge }
}
