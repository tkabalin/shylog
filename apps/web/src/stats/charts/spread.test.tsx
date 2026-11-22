import { act } from "react"
import { expect, test } from "vitest"

import { render } from "@/dive/form/testing"

import { Spread } from "./spread"

test("reads out the tallest bar, then the one a tap picks", () => {
  const rates = [12.2, 14.1, 14.5, 14.9, 15.3, 17.8]
  const { container, unmount } = render(
    <Spread rates={rates} mean={14.8} deviation={1.8} />
  )
  const readout = container.querySelector("[data-slot=readout]")!
  expect(readout.textContent).toBe("14 to 15 L/min")
  // jsdom lays nothing out, so the plot gets a width: one L/min per 10 px
  // from the axis' low end.
  const plot = container.querySelector<HTMLElement>(".cursor-crosshair")!
  const low = 9
  plot.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect
  const at = { clientX: (17.5 - low) * 10, clientY: 50 }
  tap(plot, at)
  expect(readout.textContent).toBe("17 to 18 L/min")
  unmount()
})

// A finger's tap: down and up where it landed.
function tap(element: Element, at: { clientX: number; clientY: number }) {
  for (const type of ["pointerdown", "pointerup"])
    act(() =>
      element.dispatchEvent(
        new PointerEvent(type, { bubbles: true, pointerType: "touch", ...at })
      )
    )
}
