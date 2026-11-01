import {
  fractionToTenths,
  mergeDuplicateSamples,
  toMillimetres,
} from "@shylog/core"
import type { Element } from "@xmldom/xmldom"
import { describe, expect, it } from "vitest"

import { readUddf } from "../../src/uddf/sample-reader.ts"
import { d4iXml, zoopXml } from "../uddf-fixtures.ts"
import { readAsSubsurface } from "./subsurface-uddf.ts"

// Shylog's reader against Subsurface's own import, dive by dive, on the two
// real exports. Shylog's departures are applied to Subsurface's answer, as
// the core differential test does: see each one below.

const tags = (parent: Element, name: string) =>
  Array.from(parent.getElementsByTagName(name))
const seconds = (time: string) => {
  const [, minutes, secs] = /^(\d+):(\d\d) min$/.exec(time)!
  return Number(minutes) * 60 + Number(secs)
}
const millimetres = (depth: string) => toMillimetres(parseFloat(depth))
const tenthsOfDegree = (celsius: number) => Math.round(celsius * 10)

function subsurfaceDives(uddf: string) {
  return tags(readAsSubsurface(uddf).documentElement!, "dive").map((dive) => {
    const computer = tags(dive, "divecomputer")[0]!
    const depth = tags(computer, "depth")[0]!
    const o2 = tags(dive, "cylinder")[0]?.getAttribute("o2")
    const events = tags(computer, "event").map((event) => ({
      name: event.getAttribute("name")!,
      time: seconds(event.getAttribute("time")!),
    }))
    return {
      startTime: `${dive.getAttribute("date")}T${dive.getAttribute("time")}`,
      duration: seconds(dive.getAttribute("duration")!),
      maxDepth: millimetres(depth.getAttribute("max")!),
      averageDepth: depth.getAttribute("mean")
        ? millimetres(depth.getAttribute("mean")!)
        : null,
      hasCylinder: o2 !== undefined,
      oxygen: o2 ? fractionToTenths(Number(o2)) : null,
      computerModel: computer.getAttribute("model"),
      // Departure: one sample per time, keeping the first (core's merge).
      samples: mergeDuplicateSamples(
        tags(computer, "sample").map((sample) => {
          const temp = sample.getAttribute("temp")
          return {
            time: seconds(sample.getAttribute("time")!),
            depth: millimetres(sample.getAttribute("depth")!),
            temperature: temp ? tenthsOfDegree(parseFloat(temp)) : null,
            pressure: null,
          }
        })
      ),
      gasChanges: events.filter((event) => event.name === "gaschange"),
      // Departure: Shylog pairs ascent alarms into one event with an end.
      alarms: events
        .filter((event) => event.name !== "gaschange")
        .map((event) => `${event.name}@${event.time}`)
        .sort(),
    }
  })
}

function shylogDives(uddf: string) {
  return readUddf(uddf).map((dive) => ({
    ...dive,
    maxDepth: toMillimetres(dive.maxDepth),
    averageDepth:
      dive.averageDepth == null ? null : toMillimetres(dive.averageDepth),
    samples: dive.samples.map((sample) => ({
      ...sample,
      depth: toMillimetres(sample.depth),
      temperature:
        sample.temperature == null ? null : tenthsOfDegree(sample.temperature),
    })),
    alarms: dive.events
      .flatMap((event) =>
        [event.start, ...(event.end == null ? [] : [event.end])].map(
          (time) => `${event.type}@${time}`
        )
      )
      .sort(),
  }))
}

// Each export takes a second or more through xsltproc, inside the tests'
// timeout rather than at collection, where a failure would hide the report.
describe("Shylog's reader against Subsurface's", { timeout: 20_000 }, () => {
  describe.each([
    ["D4i", d4iXml, 72, 46],
    ["Zoop Novo", zoopXml, 61, 31],
  ])("on the %s export", (_, uddf, all, scuba) => {
    let read:
      | {
          theirs: ReturnType<typeof subsurfaceDives>
          ours: Map<string, ReturnType<typeof shylogDives>[number]>
        }
      | undefined
    const both = () =>
      (read ??= {
        theirs: subsurfaceDives(uddf),
        ours: new Map(shylogDives(uddf).map((dive) => [dive.startTime, dive])),
      })

    // Departure: the seeding reader leaves out dives with no tank data, the
    // freedives (the import applies the full rule, milestone 14).
    it("reads the same dives, leaving out exactly those with no tank data", () => {
      const { theirs, ours } = both()
      expect(theirs).toHaveLength(all)
      expect(ours.size).toBe(scuba)
      expect(
        theirs
          .filter((dive) => dive.hasCylinder)
          .map((d) => d.startTime)
          .sort()
      ).toEqual([...ours.keys()].sort())
    })

    const paired = () => {
      const { theirs, ours } = both()
      return theirs
        .map((dive) => [dive, ours.get(dive.startTime)!] as const)
        .filter(([, mine]) => mine)
    }

    it("agrees on each dive's figures, gas and computer", () => {
      for (const [dive, mine] of paired()) {
        expect({
          at: dive.startTime,
          duration: mine.duration,
          maxDepth: mine.maxDepth,
          hasAverage: mine.averageDepth != null,
          oxygen: mine.oxygen,
          computerModel: mine.computerModel,
        }).toEqual({
          at: dive.startTime,
          duration: dive.duration,
          maxDepth: dive.maxDepth,
          hasAverage: dive.averageDepth != null,
          // Departure: 21 % and under is air, null, as Subsurface's loader
          // also reads it (D9).
          oxygen:
            dive.oxygen == null || dive.oxygen <= 210 ? null : dive.oxygen,
          computerModel: dive.computerModel,
        })
        // Departure: Shylog keeps the computer's averagedepth to the mm, where
        // Subsurface's stylesheet writes it to the cm (format-number '0.00').
        if (mine.averageDepth != null)
          expect(
            Math.abs(mine.averageDepth - dive.averageDepth!)
          ).toBeLessThanOrEqual(5)
      }
    })

    it("agrees on every sample's time, depth and temperature", () => {
      for (const [dive, mine] of paired()) {
        expect({
          at: dive.startTime,
          samples: mine.samples,
        }).toEqual({
          at: dive.startTime,
          samples: dive.samples,
        })
      }
    })

    it("agrees on every alarm, with the gas set once at the start", () => {
      for (const [dive, mine] of paired()) {
        expect({
          at: dive.startTime,
          alarms: mine.alarms,
        }).toEqual({
          at: dive.startTime,
          alarms: dive.alarms,
        })
        // Departure: the time-0 gas change is the dive's gas, never an event.
        expect(dive.gasChanges.map((change) => change.time)).toEqual([0])
      }
    })
  })
})
