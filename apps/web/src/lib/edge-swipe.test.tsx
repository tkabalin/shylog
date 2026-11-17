import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

import { useEdgeSwipeBlock } from "./edge-swipe"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

function Holder() {
  useEdgeSwipeBlock()
  return null
}

let button: HTMLButtonElement
let input: HTMLInputElement
let clicks: ReturnType<typeof vi.fn<(event: Event) => void>>
const roots: ReturnType<typeof createRoot>[] = []
const hold = () => {
  const root = createRoot(document.createElement("div"))
  act(() => root.render(<Holder />))
  roots.push(root)
  return () => act(() => root.unmount())
}

beforeEach(() => {
  // iOS's Safari is the only browser with it.
  Object.defineProperty(navigator, "standalone", {
    value: true,
    configurable: true,
  })
  document.body.innerHTML = "<button>Close</button><input>"
  button = document.querySelector("button")!
  input = document.querySelector("input")!
  clicks = vi.fn<(event: Event) => void>()
  button.addEventListener("click", clicks)
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  delete (navigator as { standalone?: boolean }).standalone
})

// jsdom's events, carrying what a touch event would.
function touch(
  type: string,
  target: Element,
  x: number,
  y = 100,
  id = 1,
  { cancelable = true, down = 1 } = {}
) {
  const point = {
    identifier: id,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
  }
  const event = new Event(type, { bubbles: true, cancelable })
  const ended = type === "touchend" || type === "touchcancel"
  Object.assign(event, {
    touches: ended ? [] : Array.from({ length: down }, () => point),
    changedTouches: [point],
  })
  target.dispatchEvent(event)
  return event
}

test("cancels a touch that starts in the edge strip, and only there", () => {
  hold()
  expect(touch("touchstart", button, 12).defaultPrevented).toBe(true)
  touch("touchend", button, 12)
  expect(touch("touchstart", button, 40).defaultPrevented).toBe(false)
})

test("clicks a tap in the strip, as the cancelled touch can't", () => {
  hold()
  touch("touchstart", button, 12)
  touch("touchend", button, 14)
  expect(clicks).toHaveBeenCalledTimes(1)
  expect(clicks.mock.calls[0][0]).toMatchObject({
    clientX: 14,
    pointerType: "touch",
  })
})

test("a tap on a field in the strip focuses it", () => {
  hold()
  touch("touchstart", input, 5)
  touch("touchend", input, 5)
  expect(document.activeElement).toBe(input)
})

test("a touch that moves is a drag, not a tap", () => {
  hold()
  touch("touchstart", button, 12)
  touch("touchmove", button, 60)
  touch("touchend", button, 60)
  expect(clicks).not.toHaveBeenCalled()
  // Nor one the system took.
  touch("touchstart", button, 12)
  touch("touchcancel", button, 12)
  touch("touchend", button, 12)
  expect(clicks).not.toHaveBeenCalled()
})

test("blocks while anything holds it, and only on iOS", () => {
  const first = hold()
  const second = hold()
  first()
  expect(touch("touchstart", button, 12).defaultPrevented).toBe(true)
  touch("touchend", button, 12)
  // One click for the tap, though two hold the block.
  expect(clicks).toHaveBeenCalledTimes(1)
  second()
  expect(touch("touchstart", button, 12).defaultPrevented).toBe(false)

  delete (navigator as { standalone?: boolean }).standalone
  hold()
  expect(touch("touchstart", button, 12).defaultPrevented).toBe(false)
})

// A sheet's drag claims its moves on the document in the capture phase,
// stopping them there, as Base UI's drawer does.
test("a drag a sheet claims is still a drag, not a tap", () => {
  hold()
  const claim = (event: Event) => event.stopPropagation()
  document.addEventListener("touchmove", claim, { capture: true })
  try {
    touch("touchstart", button, 12)
    touch("touchmove", button, 12, 180)
    touch("touchend", button, 12, 180)
    expect(clicks).not.toHaveBeenCalled()
  } finally {
    document.removeEventListener("touchmove", claim, { capture: true })
  }
})

test("a second finger leaves the first one's tap alone", () => {
  hold()
  touch("touchstart", button, 12, 100, 1)
  touch("touchstart", input, 200, 300, 2, { down: 2 })
  touch("touchend", input, 200, 300, 2)
  expect(clicks).not.toHaveBeenCalled()
  touch("touchend", button, 12, 100, 1)
  expect(clicks).toHaveBeenCalledTimes(1)
})

test("a touch that stops a coasting scroll is no tap", () => {
  hold()
  // Already scrolling: the browser won't let it be cancelled.
  const coasting = touch("touchstart", button, 12, 100, 1, {
    cancelable: false,
  })
  expect(coasting.defaultPrevented).toBe(false)
  touch("touchend", button, 12)
  // Just after a scroll, it is still kept from swiping.
  const now = vi.spyOn(performance, "now").mockReturnValue(-1000)
  document.dispatchEvent(new Event("scroll"))
  now.mockReturnValue(-950)
  expect(touch("touchstart", button, 12).defaultPrevented).toBe(true)
  touch("touchend", button, 12)
  expect(clicks).not.toHaveBeenCalled()
  // Long since, a tap is a tap again.
  now.mockRestore()
  touch("touchstart", button, 12)
  touch("touchend", button, 12)
  expect(clicks).toHaveBeenCalledTimes(1)
})

test("no tap on a sheet that is closing", () => {
  hold()
  const sheet = document.createElement("div")
  sheet.dataset.slot = "drawer-popup"
  sheet.append(button)
  document.body.append(sheet)
  touch("touchstart", button, 12)
  touch("touchend", button, 12)
  expect(clicks).not.toHaveBeenCalled()
  sheet.setAttribute("data-open", "")
  touch("touchstart", button, 12)
  touch("touchend", button, 12)
  expect(clicks).toHaveBeenCalledTimes(1)
})
