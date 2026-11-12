import { afterEach, beforeEach, expect, test, vi } from "vitest"

import { pressDelay, startPress } from "./press"

let stop: () => void
let row: HTMLAnchorElement
let inner: HTMLSpanElement

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = '<a href="/x"><span>Dive 12</span></a>'
  row = document.querySelector("a")!
  inner = document.querySelector("span")!
  stop = startPress()
})

afterEach(() => {
  stop()
  vi.useRealTimers()
})

// jsdom's events, carrying what a pointer event would.
function pointer(
  type: string,
  target: Element,
  { pointerType = "touch", x = 0, y = 0 } = {}
) {
  const event = new Event(type, { bubbles: true })
  Object.assign(event, { pointerType, clientX: x, clientY: y })
  target.dispatchEvent(event)
}

const marked = () => row.hasAttribute("data-press")

test("a held touch marks its row after the wait, until it lifts", () => {
  pointer("pointerdown", inner)
  expect(marked()).toBe(false)
  vi.advanceTimersByTime(pressDelay)
  expect(marked()).toBe(true)
  pointer("pointerup", inner)
  expect(marked()).toBe(false)
})

test("a quick tap flashes its row as it lifts", () => {
  pointer("pointerdown", inner)
  vi.advanceTimersByTime(30)
  pointer("pointerup", inner)
  expect(marked()).toBe(true)
  vi.advanceTimersByTime(100)
  expect(marked()).toBe(false)
})

test("a touch that starts a scroll never marks its row", () => {
  pointer("pointerdown", inner, { y: 100 })
  pointer("pointermove", inner, { y: 112 })
  vi.advanceTimersByTime(pressDelay * 2)
  expect(marked()).toBe(false)
  // The browser taking the scroll over cancels the touch, mark or not.
  pointer("pointerdown", inner)
  vi.advanceTimersByTime(pressDelay)
  pointer("pointercancel", inner)
  expect(marked()).toBe(false)
})

test("a finger's small wobble still presses", () => {
  pointer("pointerdown", inner, { x: 10, y: 10 })
  pointer("pointermove", inner, { x: 13, y: 14 })
  vi.advanceTimersByTime(pressDelay)
  expect(marked()).toBe(true)
})

test("a mouse marks at once", () => {
  pointer("pointerdown", inner, { pointerType: "mouse" })
  expect(marked()).toBe(true)
  pointer("pointerup", inner, { pointerType: "mouse" })
  expect(marked()).toBe(false)
})

test("a pen waits, as a finger does", () => {
  pointer("pointerdown", inner, { pointerType: "pen" })
  expect(marked()).toBe(false)
  vi.advanceTimersByTime(pressDelay)
  expect(marked()).toBe(true)
  pointer("pointerup", inner, { pointerType: "pen" })
})

test("a disabled control is never marked", () => {
  document.body.innerHTML = "<button disabled>Save</button>"
  const button = document.querySelector("button")!
  pointer("pointerdown", button, { pointerType: "mouse" })
  expect(button.hasAttribute("data-press")).toBe(false)
})
