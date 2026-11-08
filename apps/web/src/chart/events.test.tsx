import { expect, test, vi } from "vitest"

import { render } from "@/dive/form/testing"

import { Events } from "./events"
import type { Alarm, StopMark } from "./model"

const point = (time: number, depth: number) => ({
  time,
  depth,
  temperature: null,
})

const alarm = (start: number): Alarm => ({
  event: { type: "ascent", start, end: start + 2 },
  from: point(start, 8000),
  to: point(start + 2, 7500),
  peak: 12,
  peakIndex: start,
})

const stop: StopMark = {
  start: 2061,
  end: 2352,
  held: 285,
  depth: 5016,
  full: true,
  index: 40,
}

const rows = (container: HTMLElement) =>
  [...container.querySelectorAll("button")].map(
    (button) => button.getAttribute("aria-label")!.split(" from ")[0]
  )

test("lists the stop among the alarms in time order", () => {
  // An alarm before the stop, and one on the ascent from it.
  const { container, unmount } = render(
    <Events alarms={[alarm(1500), alarm(2400)]} stop={stop} onShow={vi.fn()} />
  )
  expect(rows(container)).toEqual([
    expect.stringMatching(/^Ascent rate alarm at 25:00/),
    "Safety stop",
    expect.stringMatching(/^Ascent rate alarm at 40:00/),
  ])
  expect(container.querySelector("h3 + span")?.textContent).toBe("3")
  unmount()
})

test("names a short stop and speaks its time held", () => {
  const onShow = vi.fn()
  const { container, unmount } = render(
    <Events
      alarms={[]}
      stop={{ ...stop, held: 61, full: false }}
      onShow={onShow}
    />
  )
  const button = container.querySelector("button")!
  expect(button.getAttribute("aria-label")).toBe(
    "Short safety stop from 34:21, held 1 minute 1 second at an average of 5.0 metres. Show on profile."
  )
  button.click()
  expect(onShow).toHaveBeenCalledWith(40)
  unmount()
})

test("shows nothing with no alarm or stop", () => {
  const { container, unmount } = render(
    <Events alarms={[]} stop={null} onShow={vi.fn()} />
  )
  expect(container.innerHTML).toBe("")
  unmount()
})
