import { expect, test, vi } from "vitest"

import { render } from "@/dive/form/testing"

import { Events } from "./events"
import type { Alarm, MandatoryStop, StopMark } from "./model"

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

// Begun at 25:00, cleared at 26:30 at 5.2 m unless left open.
const mandatory = (open = false): MandatoryStop => ({
  event: { type: "mandatory-stop", start: 1500, end: open ? null : 1590 },
  begin: point(1500, 8000),
  beginIndex: 30,
  cleared: open ? null : { point: point(1590, 5200), index: 36 },
})

const rows = (container: HTMLElement) =>
  [...container.querySelectorAll("button")].map(
    (button) => button.getAttribute("aria-label")!.split(" from ")[0]
  )

test("lists the stop among the alarms in time order", () => {
  // An alarm before the stop, and one on the ascent from it.
  const { container, unmount } = render(
    <Events
      alarms={[alarm(1500), alarm(2400)]}
      mandatory={[]}
      stop={stop}
      onShow={vi.fn()}
    />
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
      mandatory={[]}
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
    <Events alarms={[]} mandatory={[]} stop={null} onShow={vi.fn()} />
  )
  expect(container.innerHTML).toBe("")
  unmount()
})

test("lists a mandatory stop after the alarm that began it, then its clearing", () => {
  const onShow = vi.fn()
  const { container, unmount } = render(
    <Events
      alarms={[alarm(1500)]}
      mandatory={[mandatory()]}
      stop={stop}
      onShow={onShow}
    />
  )
  const buttons = [...container.querySelectorAll("button")]
  expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
    expect.stringMatching(/^Ascent rate alarm at 25:00/),
    "Mandatory stop from 25:00 at 8.0 metres. Show on profile.",
    "Mandatory stop cleared at 26:30, 5.2 metres. Show on profile.",
    expect.stringMatching(/^Safety stop from 34:21/),
  ])
  expect(buttons[1].textContent).toBe("Mandatory stop8.0 m at 25:00")
  buttons[1].click()
  buttons[2].click()
  expect(onShow.mock.calls).toEqual([[30], [36]])
  expect(container.querySelector("h3 + span")?.textContent).toBe("4")
  unmount()
})

test("gives a stop never cleared one row", () => {
  const { container, unmount } = render(
    <Events
      alarms={[]}
      mandatory={[mandatory(true)]}
      stop={null}
      onShow={vi.fn()}
    />
  )
  const buttons = [...container.querySelectorAll("button")]
  expect(buttons).toHaveLength(1)
  expect(buttons[0].getAttribute("aria-label")).toBe(
    "Mandatory stop from 25:00 at 8.0 metres. Show on profile."
  )
  unmount()
})
