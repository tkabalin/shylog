import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

import { Fold } from "./fold"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no Web Animations: each animation here is a stand-in whose end
// the test calls, and reduced motion is asked for, so nothing slides.
let played: { onfinish: (() => void) | null; keyframes: unknown }[] = []
const roots: ReturnType<typeof createRoot>[] = []
const { animate } = Element.prototype
const { matchMedia } = window
beforeEach(() => {
  played = []
  vi.useFakeTimers()
  Element.prototype.animate = function (keyframes) {
    const one = {
      keyframes,
      onfinish: null,
      cancel() {},
      finished: new Promise(() => {}),
    }
    played.push(one)
    return one as unknown as Animation
  }
  window.matchMedia = () => ({ matches: true }) as MediaQueryList
})
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  Element.prototype.animate = animate
  window.matchMedia = matchMedia
  vi.useRealTimers()
  document.body.innerHTML = ""
})

function mount(open: boolean, onFolded?: () => void) {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  const render = (now: boolean) =>
    act(() =>
      root.render(
        <Fold open={now} appear={false} onFolded={onFolded}>
          Note
        </Fold>
      )
    )
  render(open)
  return { box: host.firstElementChild as HTMLElement, render }
}

test("one drawn closed takes no room, and shows once opened", () => {
  const { box, render } = mount(false)
  expect(box.style.display).toBe("none")
  render(true)
  expect(box.style.display).toBe("")
})

test("calls back once folded away, not before", () => {
  const folded = vi.fn()
  const { box, render } = mount(true, folded)
  render(false)
  vi.advanceTimersByTime(1000)
  expect(folded).not.toHaveBeenCalled()
  act(() => played.at(-1)!.onfinish!())
  expect(folded).toHaveBeenCalledTimes(1)
  expect(box.style.display).toBe("none")
})

test("a hidden page, which draws no frames, folds by the clock", () => {
  const folded = vi.fn()
  const { render } = mount(true, folded)
  Object.defineProperty(document, "hidden", { value: true, configurable: true })
  try {
    render(false)
    vi.advanceTimersByTime(1000)
    expect(folded).toHaveBeenCalledTimes(1)
  } finally {
    delete (document as { hidden?: boolean }).hidden
  }
})
