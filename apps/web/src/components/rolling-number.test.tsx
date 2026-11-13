import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it } from "vitest"

import { RollingNumber } from "./rolling-number"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.replaceChildren()
})

// 175 → 120 → 5 left the tens with two leaving digits and none current.
// Both stayed in the flow and wrapped in the shut column, a line taller.
it("keeps one digit per place in the flow through two quick changes", () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  for (const value of [175, 120, 5])
    act(() => root.render(<RollingNumber value={value} text={String(value)} />))
  const places = host.querySelectorAll(".inline-grid > span")
  expect(places).toHaveLength(3)
  for (const place of places) {
    const inFlow = [...place.children].filter(
      (digit) => !digit.classList.contains("absolute")
    )
    expect(inFlow).toHaveLength(1)
  }
})
