import { readdirSync, readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { d4iXml, zoopXml } from "../../test/uddf-fixtures.ts"
import { uddfSchemaErrors } from "../../test/uddf-schema.ts"
import { fingerprint } from "../import/fingerprint.ts"
import { leftOut } from "../import/freedive.ts"
import { readUddf, type ReadDive } from "../uddf/reader.ts"
import { downloadToUddf } from "./convert.ts"

// The watches' own downloads (fixtures/dctool/) against the Subsurface
// exports of the same dives: the import must read both alike.
function download(watch: string, model: string) {
  const folder = new URL(
    `../../../../fixtures/dctool/${watch}/xml/`,
    import.meta.url
  )
  const dives = readdirSync(folder)
    .sort()
    .map((name, i) => ({
      id: `dive-${i}`,
      xml: readFileSync(new URL(name, folder), "utf8"),
    }))
  return downloadToUddf(dives, model)
}

// The seconds each dive has a sample from the watch, by its start.
function sampled(watch: string) {
  const folder = new URL(
    `../../../../fixtures/dctool/${watch}/xml/`,
    import.meta.url
  )
  return new Map(
    readdirSync(folder).map((name) => {
      const xml = readFileSync(new URL(name, folder), "utf8")
      const start = /<datetime>(.+)<\/datetime>/.exec(xml)![1].replace(" ", "T")
      const times = [...xml.matchAll(/<time>(\d+):(\d+)<\/time>/g)].map(
        ([, minutes, seconds]) => Number(minutes) * 60 + Number(seconds)
      )
      return [start, new Set(times)]
    })
  )
}

const watches = [
  { watch: "d4i", model: "Suunto D4i", exported: d4iXml, shared: 66 },
  {
    watch: "zoop-novo",
    model: "Suunto Zoop Novo",
    exported: zoopXml,
    shared: 61,
  },
]

describe.each(watches)(
  "$model's download",
  ({ watch, model, exported, shared }) => {
    const uddf = download(watch, model)
    const downloaded = new Map(
      readUddf(uddf).map((dive) => [dive.startTime, dive])
    )
    const pairs = readUddf(exported).flatMap((dive) => {
      const found = downloaded.get(dive.startTime)
      return found ? [[found, dive] as const] : []
    })

    it("holds every dive the export does that was still on the watch", () => {
      expect(pairs).toHaveLength(shared)
    })

    it("reads like the export: fingerprint, figures, gas and model", () => {
      const figures = (dive: ReadDive) => ({
        fingerprint: fingerprint(dive),
        averageDepth: dive.averageDepth,
        oxygen: dive.oxygen,
        unsupportedGas: dive.unsupportedGas,
        hasTankData: dive.hasTankData,
        hasGas: dive.hasGas,
        leftOut: leftOut(dive),
        computerModel: dive.computerModel,
      })
      for (const [got, want] of pairs)
        expect(figures(got)).toEqual(figures(want))
    })

    it("has the export's alarms, plus the computer's mandatory stops", () => {
      for (const [got, want] of pairs) {
        expect(
          got.events.filter((event) => event.type !== "mandatory-stop")
        ).toEqual(want.events)
      }
    })

    // Only waypoints made for events differ: a few depths between samples a
    // centimetre off (rounding), the export extrapolating past the last
    // sample (older stylesheet), and the stops' waypoints it lacks.
    it("has the export's samples, apart from the waypoints it adds for events", () => {
      const watched = sampled(watch)
      let interpolated = 0
      for (const [got, want] of pairs) {
        const stops = new Set(
          got.events
            .filter((event) => event.type === "mandatory-stop")
            .flatMap((event) => [event.start, event.end])
        )
        const last = want.samples.at(-1)!.time
        const wanted = new Map(
          want.samples.map((sample) => [sample.time, sample])
        )
        for (const sample of got.samples) {
          const match = wanted.get(sample.time)
          if (!match) {
            expect(stops.has(sample.time)).toBe(true)
            continue
          }
          wanted.delete(sample.time)
          expect(sample.temperature).toBe(match.temperature)
          const event = !watched.get(want.startTime)!.has(sample.time)
          const off = Math.abs(sample.depth - match.depth)
          if (off < 0.0005) continue
          // Only a waypoint made for an event differs.
          expect(event).toBe(true)
          if (sample.time === last) continue
          interpolated++
          expect(off).toBeLessThanOrEqual(0.0101)
        }
        expect([...wanted.keys()]).toEqual([])
      }
      expect(interpolated).toBeLessThan(10)
    })

    it("writes valid UDDF", () => {
      expect(uddfSchemaErrors(uddf)).toEqual([])
    })
  }
)

describe("mandatory stops", () => {
  it("are read from their deco alarms, begin to end", () => {
    const dives = readUddf(download("d4i", "Suunto D4i"))
    const dive = dives.find(
      (found) => found.startTime === "2026-07-20T11:59:25"
    )!
    expect(
      dive.events.filter((event) => event.type === "mandatory-stop")
    ).toEqual([
      { type: "mandatory-stop", start: 1699, end: 3293 },
      { type: "mandatory-stop", start: 3388, end: 3417 },
    ])
  })

  it("pair by their begin and end flags", () => {
    const sample = (time: string, events: [number, number][]) =>
      `<sample><time>${time}</time><depth>8.00</depth>${events
        .map(
          ([offset, flags]) =>
            `<event type="13" time="${offset}" flags="${flags}" value="0">safety stop (mandatory)</event>`
        )
        .join("")}</sample>`
    const xml = `<device><dive><datetime>2026-07-20 11:59:25</datetime>
      <divetime>10:00</divetime><maxdepth>8.00</maxdepth>
      ${sample("00:00", [[0, 2]])}${sample("01:00", [[0, 1]])}
      ${sample("02:00", [[0, 1]])}${sample("03:00", [[0, 2]])}
      ${sample("04:00", [[0, 1]])}${sample("05:00", [])}</dive></device>`
    const [dive] = readUddf(
      downloadToUddf([{ id: "dive-1", xml }], "Suunto D4i")
    )
    // An end with none open and a second begin add nothing; the last stop
    // runs to the end of the dive.
    expect(dive.events).toEqual([
      { type: "mandatory-stop", start: 60, end: 180 },
      { type: "mandatory-stop", start: 240, end: null },
    ])
  })
})
