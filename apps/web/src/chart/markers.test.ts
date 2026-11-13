import { describe, expect, it } from "vitest"

import { iconGap, placeIcons } from "./markers"

// A phone's plot, 330 px wide from x = 30, for a dive of `seconds`.
const left = 30
const right = 360
const scale = (seconds: number) => (time: number) =>
  left + (time * (right - left)) / seconds

describe("placeIcons", () => {
  it("leaves a stop's alarm to the hand, and the stairs over its band", () => {
    // The issue's dive: the stop became mandatory on an ascent alarm just
    // after the safety stop began, and the hand pushed both aside.
    const x = scale(2677)
    const icons = placeIcons({
      hands: [{ time: 2394, x: x(2394) }],
      alarms: [{ time: 2394, x: x(2394.5) }],
      stop: x((2390 + 2677) / 2),
      left,
      right,
    })
    expect(icons.hands).toEqual([x(2394)])
    expect(icons.alarms).toEqual([null])
    // Its band's middle is 17 px from the hand, so it moves under 1 px.
    expect(icons.stop).toBeCloseTo(x(2394) + iconGap)
    expect(icons.stop! - x((2390 + 2677) / 2)).toBeLessThan(1)
  })

  it("moves the stairs the shorter way past a hand", () => {
    const hands = [{ time: 1000, x: 200 }]
    const place = (stop: number) =>
      placeIcons({ hands, alarms: [], stop, left, right }).stop
    expect(place(205)).toBe(200 + iconGap)
    expect(place(195)).toBe(200 - iconGap)
  })

  it("moves the stairs the longer way when the plot's edge is in the way", () => {
    // A second mandatory stop near the end, in the safety stop's band.
    const x = scale(3540)
    const icons = placeIcons({
      hands: [{ time: 3388, x: x(3388) }],
      alarms: [{ time: 3388, x: x(3388.5) }],
      stop: x((3249 + 3525) / 2),
      left,
      right,
    })
    expect(icons.stop).toBeCloseTo(x(3388) - iconGap)
  })

  it("moves the stairs just past both a hand and an alarm beside it", () => {
    const icons = placeIcons({
      hands: [{ time: 1000, x: 200 }],
      alarms: [{ time: 1200, x: 220 }],
      stop: 212,
      left,
      right,
    })
    expect(icons.alarms).toEqual([220])
    expect(icons.stop).toBe(220 + iconGap)
  })

  it("keeps an alarm near a hand over its own mark, over the hand", () => {
    const icons = placeIcons({
      hands: [{ time: 1000, x: 200 }],
      alarms: [{ time: 1040, x: 205 }],
      stop: null,
      left,
      right,
    })
    expect(icons.alarms).toEqual([205])
    expect(icons.stop).toBeNull()
  })

  it("keeps close alarms over their bands, over each other", () => {
    const icons = placeIcons({
      hands: [],
      alarms: [
        { time: 1082, x: 100 },
        { time: 1148, x: 103 },
      ],
      stop: null,
      left,
      right,
    })
    expect(icons.alarms).toEqual([100, 103])
  })

  it("keeps each icon whole inside the plot", () => {
    const icons = placeIcons({
      hands: [{ time: 0, x: left }],
      alarms: [{ time: 4000, x: right }],
      stop: null,
      left,
      right,
    })
    expect(icons.hands).toEqual([left + 7])
    expect(icons.alarms).toEqual([right - 7])
  })
})
