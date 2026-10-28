import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"

import { Haptic } from "./haptic"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

// The label hands the tap on to its switch, whose own click bubbles too;
// a toggle that saw both would turn straight back off.
it("ticks once and reaches the control once per tap", () => {
  const vibrate = vi.fn()
  vi.stubGlobal("navigator", { vibrate })
  const onClick = vi.fn()
  const host = document.createElement("div")
  document.body.append(host)
  act(() =>
    createRoot(host).render(
      <button type="button" onClick={onClick}>
        Boat
        <Haptic />
      </button>
    )
  )
  act(() => host.querySelector("label")!.click())
  expect(host.querySelector("input")!.checked).toBe(true)
  expect(onClick).toHaveBeenCalledTimes(1)
  expect(vibrate).toHaveBeenCalledTimes(1)
})
