// Rows tint while pressed as native iOS lists do, through `data-press`
// rather than `:active`: a touch marks its control only once it has held
// still for a moment, so a finger that starts a scroll never lights the
// rows it lands on, and a quick tap still flashes as it lifts. A mouse marks
// at once. Buttons keep their instant `:active` dim.

// About UIKit's own wait before a scroll view's row highlights.
export const pressDelay = 90
// How long a quick tap's mark shows before it fades.
const flash = 100
// A finger that moves further is scrolling, not pressing.
const slop = 8

const controls =
  'a[href], button, label, input, select, textarea, summary, [role="button"], [role="link"], [role="option"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"]'

let pressed: Element | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let start = { x: 0, y: 0 }

function mark(element: Element) {
  pressed = element
  element.setAttribute("data-press", "")
}

function clear() {
  clearTimeout(timer)
  timer = undefined
  pressed?.removeAttribute("data-press")
  pressed = null
}

function down(event: PointerEvent) {
  clear()
  const target = event.target instanceof Element ? event.target : null
  const control = target?.closest(controls)
  if (!control || control.matches(':disabled, [aria-disabled="true"]')) return
  // A pen scrolls as a finger does, so only a mouse marks at once.
  if (event.pointerType === "mouse") {
    mark(control)
    return
  }
  start = { x: event.clientX, y: event.clientY }
  pressed = control
  timer = setTimeout(() => {
    timer = undefined
    mark(control)
  }, pressDelay)
}

function move(event: PointerEvent) {
  if (!pressed || event.pointerType === "mouse") return
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > slop)
    clear()
}

function up() {
  const control = pressed
  if (!control) return
  if (timer === undefined) {
    clear()
    return
  }
  // A tap shorter than the wait: the mark shows briefly, then fades.
  clearTimeout(timer)
  timer = setTimeout(clear, flash)
  mark(control)
}

// Once, at launch. Capture, so a handler that stops propagation can't hide
// a press, and passive, so scrolling never waits on it.
export function startPress(root: Document = document) {
  const options = { capture: true, passive: true }
  root.addEventListener("pointerdown", down, options)
  root.addEventListener("pointermove", move, options)
  root.addEventListener("pointerup", up, options)
  root.addEventListener("pointercancel", clear, options)
  // A scroll the browser took over before any move arrived.
  root.addEventListener("scroll", clear, options)
  return () => {
    clear()
    root.removeEventListener("pointerdown", down, options)
    root.removeEventListener("pointermove", move, options)
    root.removeEventListener("pointerup", up, options)
    root.removeEventListener("pointercancel", clear, options)
    root.removeEventListener("scroll", clear, options)
  }
}
