import { useEffect } from "react"

// iOS's back swipe starts at the screen's left edge, in Safari and the
// installed app alike, and would take a sheet's or the card viewer's page
// away under it. Cancelling a touch that starts this close stops it.
const strip = 30
// A finger that moves further is a drag or a scroll, not a tap.
const slop = 10
// Only iOS has the swipe to stop, and only its Safari has `standalone`.
const ios = () => "standalone" in navigator

let holders = 0
let start: { id: number; target: Element; x: number; y: number } | null = null
let scrolled = -Infinity

function onScroll() {
  scrolled = performance.now()
}

function onStart(event: TouchEvent) {
  // Already scrolling, which the browser won't let a page cancel.
  if (!event.cancelable) return
  const touch = event.changedTouches[0]
  if (event.touches.length !== 1 || !touch || touch.clientX >= strip) return
  if (!(event.target instanceof Element)) return
  event.preventDefault()
  // Still kept from swiping, but a finger that stops a coast isn't a tap.
  start =
    performance.now() - scrolled < 100
      ? null
      : {
          id: touch.identifier,
          target: event.target,
          x: touch.clientX,
          y: touch.clientY,
        }
}

const ours = (event: TouchEvent) =>
  start &&
  [...event.changedTouches].find((touch) => touch.identifier === start!.id)

function onMove(event: TouchEvent) {
  const touch = ours(event)
  if (
    touch &&
    Math.hypot(touch.clientX - start!.x, touch.clientY - start!.y) > slop
  )
    start = null
}

// The cancelled touch takes its click with it, so a tap on a row, a field
// or Close in the strip is clicked here, as the tap would have been.
function onEnd(event: TouchEvent) {
  const touch = ours(event)
  const tapped = start
  if (!touch || !tapped) return
  start = null
  const { target } = tapped
  if (!target.isConnected) return
  // Not on a sheet already closing. (Its data-swiping is set from the touch
  // down, so it can't tell a tap from a pull; the moves above do.)
  if (target.closest("[data-slot=drawer-popup]:not([data-open])")) return
  const field = target.closest("input, textarea, select")
  if (field instanceof HTMLElement && !field.matches(":disabled")) field.focus()
  target.dispatchEvent(
    new PointerEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
      detail: 1,
      clientX: touch.clientX,
      clientY: touch.clientY,
      screenX: touch.screenX,
      screenY: touch.screenY,
      pointerType: "touch",
      isPrimary: true,
    })
  )
}

function onCancel(event: TouchEvent) {
  if (ours(event)) start = null
}

const capture = { capture: true, passive: true }

// While held (a sheet open, the card viewer up), the edge swipe can't go
// back. The start bubbles, so a sheet's drag-to-close sees it first; the
// rest capture, as a sheet's drag stops its moves before the bubble phase.
export function useEdgeSwipeBlock() {
  useEffect(() => {
    if (!ios()) return
    if (holders++ === 0) {
      window.addEventListener("touchstart", onStart, { passive: false })
      window.addEventListener("touchmove", onMove, capture)
      window.addEventListener("touchend", onEnd, capture)
      window.addEventListener("touchcancel", onCancel, capture)
      document.addEventListener("scroll", onScroll, capture)
    }
    return () => {
      if (--holders) return
      window.removeEventListener("touchstart", onStart)
      window.removeEventListener("touchmove", onMove, capture)
      window.removeEventListener("touchend", onEnd, capture)
      window.removeEventListener("touchcancel", onCancel, capture)
      document.removeEventListener("scroll", onScroll, capture)
      start = null
    }
  }, [])
}
