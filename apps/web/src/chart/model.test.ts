import { mergeDuplicateSamples, safetyStop } from "@shylog/core"
import { describe, expect, it } from "vitest"

import type { Profile } from "@/api/client"
import type { Dive, FieldMeta } from "@/data/db"
import { profileMaxDepth } from "@/dive/figures"

import {
  fixtureDive,
  fixtureDiveAt,
} from "../../../../packages/core/test/fixture.ts"
import { clock, rateLabel } from "./format"
import {
  eventLabel,
  eventsAt,
  inStop,
  pointAt,
  profileModel,
  rate,
  type ProfileEvent,
} from "./model"

// Fixture dive 54 as the server sends it: merged samples, its five ascent
// alarms as spans, and the surface events at its start and end, with the
// safety stop the server keeps on the dive.
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
  return profileModel(
    profile,
    {
      maxDepth: dive.maxDepth,
      mod: 56.2,
      safetyStop: safetyStop(profile.samples),
    },
    width
  )
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

  it("keeps the safety stop apart from the events, adding no points", () => {
    const { safetyStop: stop } = model
    expect(stop).toMatchObject({
      start: 1172,
      end: 1822,
      held: 579,
      depth: 5519,
      full: true,
    })
    // The first point in the band, as Subsurface's points have none at 1172 s.
    expect(model.points[stop!.index - 1].time).toBeLessThan(1172)
    expect(model.points[stop!.index].time).toBeGreaterThanOrEqual(1172)
    expect(model.points.some((point) => point.time === 1172)).toBe(false)
    expect(model.events.every((event) => event.start !== 1172)).toBe(true)
    expect(inStop(model, 1172)).toBe(true)
    expect(inStop(model, 1822)).toBe(true)
    expect(inStop(model, 1823)).toBe(false)
  })

  it("has no safety stop unless the dive has one", () => {
    const { samples } = fixtureDive(54)
    const none = profileModel(
      { samples: mergeDuplicateSamples(samples), events: [] },
      { maxDepth: 42.28, mod: null },
      326
    )
    expect(none.safetyStop).toBeNull()
    expect(inStop(none, 1200)).toBe(false)
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

  it("gives the water's range, not the lane's 2 °C axis", () => {
    const samples = [22, 22.4, 22.2].map((temperature, i) => ({
      time: (i + 1) * 60,
      depth: 10,
      temperature,
      pressure: null,
    }))
    const model = profileModel(
      { samples, events: [] },
      { maxDepth: 10, mod: null },
      326
    )
    expect(model.temperature).toMatchObject({ min: 22, max: 24 })
    expect(model.water).toEqual({ min: 22, max: 22.4 })
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

describe("the depth labels' gutter", () => {
  const profile = (deepest: number): Profile => ({
    samples: [
      { time: 0, depth: 0, temperature: null, pressure: null },
      { time: 600, depth: deepest, temperature: null, pressure: null },
      { time: 1200, depth: 0, temperature: null, pressure: null },
    ],
    events: [],
  })

  it("widens for an axis that reaches three digits", () => {
    expect(
      profileModel(profile(42), { maxDepth: 42, mod: null }, 326).left
    ).toBe(30)
    const deep = profileModel(profile(104), { maxDepth: 104, mod: null }, 326)
    expect(deep.depth.max).toBeGreaterThanOrEqual(100_000)
    expect(deep.left).toBe(38)
  })
})

describe("the profile's depth", () => {
  it("follows the computer's max depth, not a hand value that replaced it", () => {
    const dive = { maxDepth: 33 } as Dive
    const meta = new Map<string, FieldMeta>([
      [
        "maxDepth",
        {
          diveId: "dive-a",
          field: "maxDepth",
          source: "hand",
          computerValue: 32.66,
          dismissed: false,
        },
      ],
    ])
    expect(profileMaxDepth(dive, meta)).toBe(32.66)
    expect(profileMaxDepth(dive, undefined)).toBe(33)
  })
})

describe("the smoothed temperature lane", () => {
  // 30 December 2025: the recorded line starts at 20 °C on the way down, but
  // the water was 17 °C throughout.
  const dive = fixtureDiveAt("2025-12-30T11:43")
  const profile: Profile = {
    samples: mergeDuplicateSamples(dive.samples),
    events: [],
  }
  const model = (smooth: boolean) =>
    profileModel(profile, { maxDepth: dive.maxDepth, mod: null, smooth }, 326)

  it("draws the water's temperature, and its axis and labels follow", () => {
    expect(model(true)).toMatchObject({
      smoothed: true,
      water: { min: 17, max: 17 },
    })
    expect(model(false)).toMatchObject({
      smoothed: false,
      water: { min: 17, max: 20 },
    })
  })

  it("leaves the depth line alone", () => {
    const depths = (m: ReturnType<typeof model>) =>
      m.points.map((point) => point.depth)
    expect(depths(model(true))).toEqual(depths(model(false)))
  })
})
