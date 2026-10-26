import { mergeDuplicateSamples } from "@shylog/core"
import { describe, expect, it } from "vitest"

import type { Profile } from "@/api/client"

import { fixtureDive } from "../../../../packages/core/test/fixture.ts"
import { clock, rateLabel } from "./format"
import {
  eventLabel,
  eventsAt,
  pointAt,
  profileModel,
  rate,
  type ProfileEvent,
} from "./model"

// Fixture dive 54 as the server sends it: merged samples, its five ascent
// alarms as spans, and the surface events at its start and end.
function dive54(width = 326) {
  const dive = fixtureDive(54)
  const ascents = [
    [257, 258],
    [516, 517],
    [848, 852],
    [1081, 1083],
    [1145, 1151],
  ]
  const profile: Profile = {
    samples: mergeDuplicateSamples(dive.samples),
    events: [
      { type: "surface", start: 0, end: null },
      ...ascents.map(([start, end]) => ({ type: "ascent", start, end })),
      { type: "surface", start: 1837, end: null },
    ],
  }
  return profileModel(profile, { maxDepth: dive.maxDepth, mod: 56.2 }, width)
}

describe("profileModel", () => {
  const model = dive54()
  const at = (time: number) =>
    model.speeds[model.points.findIndex((point) => point.time === time)]

  it("bands dive 54's segments by vertical speed", () => {
    // 3.46 m down in 10 s: 346 mm/s, Fast for a descent.
    expect(at(60)).toEqual({ speed: 346, band: "fast" })
    // A 10 s step of 104 mm/s, banded from 0 s, 20 s back: 22 mm/s.
    expect(at(20)).toEqual({ speed: 104, band: "stable" })
    // 123 mm/s up is Moderate, and so is 85 mm/s over the 20 s lookback.
    expect(at(250)).toEqual({ speed: -123, band: "moderate" })
    // 181 mm/s up in the first alarm is Fast, which keeps its own step.
    expect(at(257)).toEqual({ speed: -181, band: "fast" })
  })

  it("lists the five ascent alarms with their peak rates, not surface events", () => {
    expect(model.events.map((event) => event.type)).toEqual(
      Array(5).fill("ascent")
    )
    expect(model.alarms.map((alarm) => alarm.peak)).toEqual([
      10.86, 9.66, 16.2, 11.4, 13.68,
    ])
    const first = model.alarms[0]
    expect(model.points[first.peakIndex].time).toBe(257)
    expect(first.from.time).toBe(257)
    expect(first.to.time).toBe(258)
  })

  it("leaves off an air MOD past the depth axis", () => {
    expect(Math.round(model.depth.max)).toBe(50_000)
    expect(model.mod).toBeNull()
  })

  it("rests the crosshair on the deepest point", () => {
    expect(model.points[model.deepest]).toMatchObject({
      time: 230,
      depth: 42_220,
    })
  })

  it("keeps a long dive's exact end and cuts no point", () => {
    expect(model.time.max).toBe(1837)
    expect(model.points.at(-1)!.time).toBeLessThanOrEqual(1837)
  })

  it("cuts the last point at a 30 s axis's end", () => {
    // Under water to 10 s, so the axis is the 30 s floor; the sample at 45 s
    // is the one past the end, cut where the axis ends.
    const profile: Profile = {
      samples: [
        { time: 10, depth: 1, temperature: 20, pressure: null },
        { time: 20, depth: 0.5, temperature: 20, pressure: null },
        { time: 45, depth: 0, temperature: 20, pressure: null },
      ],
      events: [],
    }
    const model = profileModel(profile, { maxDepth: 1, mod: null }, 326)
    expect(model.time.max).toBe(30)
    expect(model.points.at(-1)).toMatchObject({ time: 30, depth: 300 })
  })

  it("fits the axes to a shallow, short dive", () => {
    const profile: Profile = {
      samples: [
        { time: 60, depth: 9.4, temperature: 20, pressure: null },
        { time: 600, depth: 0, temperature: 20, pressure: null },
      ],
      events: [],
    }
    const model = profileModel(profile, { maxDepth: 9.4, mod: null }, 326)
    expect(model.time.max).toBe(600)
    // 9.4 + 3 m on six ticks: 4 m steps to 16 m, no 30 m floor.
    expect(Math.round(model.depth.max)).toBe(16_000)
  })

  it("puts events in time order", () => {
    const profile: Profile = {
      samples: [{ time: 10, depth: 10, temperature: 20, pressure: null }],
      events: [
        { type: "rbt", start: 40, end: null },
        { type: "ascent", start: 20, end: 22 },
      ],
    }
    const model = profileModel(profile, { maxDepth: 10, mod: null }, 326)
    expect(model.events.map((event) => event.start)).toEqual([20, 40])
  })

  it("treats an event ending before its start as a moment", () => {
    const profile: Profile = {
      samples: [
        { time: 10, depth: 10, temperature: 20, pressure: null },
        { time: 20, depth: 5, temperature: 20, pressure: null },
      ],
      events: [{ type: "ascent", start: 20, end: 15 }],
    }
    const model = profileModel(profile, { maxDepth: 10, mod: null }, 326)
    expect(model.events[0].end).toBe(20)
    expect(eventsAt(model.events, 20)).toHaveLength(1)
    expect(model.alarms[0].from.time).toBe(20)
  })

  it("labels each temperature only the first time", () => {
    // Back and forth between 13 and 14 °C, a minute at a time.
    const samples = Array.from({ length: 8 }, (_, i) => ({
      time: (i + 1) * 60,
      depth: 10,
      temperature: i % 2 ? 14 : 13,
      pressure: null,
    }))
    const model = profileModel(
      { samples, events: [] },
      { maxDepth: 10, mod: null },
      326
    )
    expect(model.temperatureLabels.map((label) => label.temperature)).toEqual([
      13, 14,
    ])
  })

  it("has no temperature range when none was recorded", () => {
    const profile: Profile = {
      samples: [{ time: 10, depth: 5, temperature: null, pressure: null }],
      events: [],
    }
    const model = profileModel(profile, { maxDepth: 5, mod: null }, 326)
    expect(model.temperature).toBeNull()
    expect(model.water).toBeNull()
  })
})

describe("the crosshair", () => {
  const model = dive54()

  it("takes the first point at or after its time", () => {
    expect(model.points[pointAt(model.points, 255)].time).toBe(257)
    expect(model.points[pointAt(model.points, 257)].time).toBe(257)
    expect(pointAt(model.points, 99_999)).toBe(model.points.length - 1)
  })

  it("reads 0 at a point at the same time as the one before", () => {
    expect(model.points[1].time).toBe(model.points[0].time)
    expect(rateLabel(rate(model.speeds[1].speed))).toBe("0.0")
  })

  it("moves in steps of 0.06 m/min, positive when ascending", () => {
    expect(rate(-181)).toBe(10.86)
    expect(rate(1)).toBe(-0.06)
    expect(rateLabel(rate(-181))).toBe("+10.9")
    expect(rateLabel(rate(346))).toBe("−20.8")
  })

  it("names an alarm for as long as the crosshair is on its drawn band", () => {
    // 257–258 s, drawn 6 px wide: about 37 s on a 1837 s axis 296 px wide.
    const model = dive54(326 - 30)
    expect(eventsAt(model.events, 290, model.eventEnd)).toHaveLength(1)
    expect(eventsAt(model.events, 290)).toEqual([])
    expect(eventsAt(model.events, 300, model.eventEnd)).toEqual([])
  })

  it("names the alarm recorded at a time before a widened band over it", () => {
    const events = [
      { type: "rbt", start: 100, end: 101 },
      { type: "ascent", start: 120, end: 125 },
    ]
    const drawn = (event: ProfileEvent) =>
      Math.max(event.end ?? event.start, event.start + 37)
    expect(eventsAt(events, 122, drawn).map((e) => e.type)).toEqual([
      "ascent",
      "rbt",
    ])
    expect(eventsAt(events, 130, drawn).map((e) => e.type)).toEqual([
      "rbt",
      "ascent",
    ])
  })

  it("names the alarm it sits in", () => {
    expect(eventsAt(model.events, 850).map((event) => event.start)).toEqual([
      848,
    ])
    expect(eventsAt(model.events, 853)).toEqual([])
  })

  it("names alarm types, keeping acronyms", () => {
    expect(["ascent", "rbt", "microbubbles"].map(eventLabel)).toEqual([
      "Ascent",
      "RBT",
      "Microbubbles",
    ])
  })

  it("shows elapsed time as m:ss", () => {
    expect(clock(257)).toBe("4:17")
    expect(clock(5)).toBe("0:05")
  })
})
