import { act } from "react"
import { expect, test, vi } from "vitest"

import { cursor } from "@/chart/crosshair"
import { render, testDive } from "@/dive/form/testing"
import { sacTrend } from "@/stats/trend"

import { SacReadout, SacTrend } from "./sac-trend"

// jsdom lays nothing out, so the chart gets a phone's size.
vi.mock("@/chart/size", () => ({
  useSize: () => ({ width: 358, height: 168 }),
}))

const trend = (rates: number[]) =>
  sacTrend(
    rates.map((sac, i) => ({
      dive: testDive({
        id: `dive-${i}`,
        number: i + 1,
        startTime: `2026-0${1 + (i % 9)}-1${i % 10}T09:00:00`,
      }),
      sac,
    }))
  )

const svg = (container: HTMLElement) =>
  container.querySelector("svg.recharts-surface")!
const average = 'path[stroke="var(--color-average)"]'

test("draws a dot per dive and a caret with its rate for one off the top", () => {
  // 60 L/min is past the fence, so it sits on the top edge.
  const rates = [14, 15, 13, 16, 14, 15, 60, 14]
  const { container, unmount } = render(
    <SacTrend
      trend={trend(rates)}
      year={undefined}
      byNumber
      cursor={cursor()}
    />
  )
  const circles = [...svg(container).querySelectorAll("circle")]
  expect(circles).toHaveLength(7)
  for (const circle of circles) {
    expect(Number(circle.getAttribute("cx"))).toBeGreaterThan(0)
    expect(Number(circle.getAttribute("cy"))).toBeGreaterThan(0)
  }
  // Along the numbers, each dot further right than the last.
  const xs = circles.map((circle) => Number(circle.getAttribute("cx")))
  for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]!)
  // The caret's tip on the plot's top edge, under the chart's 8 px margin.
  const carets = svg(container).querySelectorAll(
    'path[stroke="var(--color-sac)"]'
  )
  expect(carets).toHaveLength(1)
  const tip = carets[0]!.getAttribute("d")!.split("L")[1]!.split(" ")
  expect(Number(tip[1]) + 2).toBe(8)
  expect(svg(container).textContent).toContain("60.0")
  // The five-dive average, one curve.
  expect(svg(container).querySelectorAll(average)).toHaveLength(1)
  unmount()
})

test("draws a lone dive's dot and the rate axis, with no line", () => {
  const { container, unmount } = render(
    <SacTrend
      trend={trend([14])}
      year="2026"
      byNumber={false}
      cursor={cursor()}
    />
  )
  expect(svg(container).querySelectorAll("circle")).toHaveLength(1)
  expect(
    svg(container).querySelector(".recharts-yAxis-tick-labels text")
  ).not.toBeNull()
  expect(svg(container).querySelector(average)).toBeNull()
  unmount()
})

test("reads out the latest dive's rate, then the one a tap picks", () => {
  const rates = trend([14, 18, 13])
  const picked = cursor()
  const { container, unmount } = render(
    <>
      <SacReadout trend={rates} cursor={picked} />
      <SacTrend trend={rates} year={undefined} byNumber cursor={picked} />
    </>
  )
  const readout = container.querySelector("[data-slot=readout]")!
  expect(readout.textContent).toBe("13.0 L/min · avg 15.0")
  // A tap at the second dot, in the overlay's own coordinates (jsdom puts
  // it at the page's corner).
  const second = svg(container).querySelectorAll("circle")[1]!
  const at = { clientX: Number(second.getAttribute("cx")), clientY: 50 }
  tap(container.querySelector(".cursor-crosshair")!, at)
  expect(readout.textContent).toBe("18.0 L/min · avg 16.0")
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
