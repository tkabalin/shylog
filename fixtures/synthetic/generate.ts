import { readFileSync, writeFileSync } from "node:fs"

// Builds the cases the real exports lack from real D4i dives, as small
// Subsurface-style exports beside this file. Run `node
// fixtures/synthetic/generate.ts` after changing it; a test checks the
// checked-in files match.

const source = "d4i-2026-10-12.uddf"
const d4i = readFileSync(
  new URL(`../subsurface/${source}`, import.meta.url),
  "utf8"
)

// The export is one repetition group per dive, between a header holding the
// computer and mixes and a footer with Subsurface's empty divetrip.
const [header, rest] = d4i.split("  <profiledata>\n")
const [body, footer] = rest.split("  </profiledata>\n")
const groups = new Map(
  body
    .split(/(?= {4}<repetitiongroup)/)
    .map((group) => [
      Number(/<divenumber>(\d+)<\/divenumber>/.exec(group)![1]),
      group,
    ])
)

const dive = (n: number) => groups.get(n)!
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)

// Moves a local wall-clock time by whole seconds, with no time zone.
function shift(datetime: string, seconds: number) {
  const date = new Date(`${datetime}Z`)
  date.setUTCSeconds(date.getUTCSeconds() + seconds)
  return date.toISOString().slice(0, 19)
}
const withStart = (group: string, start: (old: string) => string) =>
  group.replace(
    /<datetime>([^<]+)<\/datetime>/,
    (_, old: string) => `<datetime>${start(old)}</datetime>`
  )

function file(about: string, dives: string[], mixes = "") {
  const head = header
    .replace("?>\n", `?>\n<!-- ${about} Made from ${source}. -->\n`)
    .replace("  </gasdefinitions>\n", `${mixes}  </gasdefinitions>\n`)
  return `${head}  <profiledata>\n${dives.join("")}  </profiledata>\n${footer}`
}

// A tank pressure on every sample, from 200 bar falling 0.05 bar a second,
// and the first and last on the tank, as Subsurface writes them from a
// sensor. UDDF puts a sample's after any switchmix, before the temperature.
function withPressure(group: string) {
  const pascals = (seconds: number) => 20_000_000 - seconds * 5000
  const times = Array.from(group.matchAll(/<divetime>(\d+)</g), ([, t]) =>
    Number(t)
  )
  const tank = `\n          <tankpressurebegin>${pascals(0)}</tankpressurebegin>\n          <tankpressureend>${pascals(Math.max(...times))}</tankpressureend>`
  return group
    .replace(/\s*<\/tankdata>/, (end) => tank + end)
    .replace(/<waypoint>[\s\S]*?<\/waypoint>/g, (waypoint) => {
      const time = Number(/<divetime>(\d+)</.exec(waypoint)![1])
      const tag = `<tankpressure>${pascals(time)}</tankpressure>`
      return waypoint.includes("<temperature>")
        ? waypoint.replace("<temperature>", `${tag}\n            <temperature>`)
        : waypoint.replace(/\n\s*<\/waypoint>/, `\n            ${tag}$&`)
    })
}

export function generate(): Record<string, string> {
  return {
    // The Sodwana week (dives 52 to 65) on a clock 5 hours behind the site,
    // as the D4i keeps home time abroad, between home dives on true time.
    "abroad.uddf": file(
      "Dives 52 to 65 with the computer's clock 5 hours behind site time; dives 51 and 66 at home on true time.",
      [
        dive(51),
        ...range(52, 65).map((n) =>
          withStart(dive(n), (old) => shift(old, -5 * 3600))
        ),
        dive(66),
      ]
    ),
    "midnight.uddf": file(
      "Dive 63 moved to start at 23:40, crossing midnight.",
      [withStart(dive(63), (old) => `${old.slice(0, 10)}T23:40:00`)]
    ),
    "gauge.uddf": file(
      "Dive 66 as a gauge dive: no tank data and no gas, sampled every 20 s.",
      [
        dive(66)
          .replace(/\s*<tankdata>[\s\S]*?<\/tankdata>/, "")
          .replace(/\s*<switchmix ref="[^"]*"\/>/, ""),
      ]
    ),
    "pressure.uddf": file(
      "Dive 63 with tank pressure on every sample and on the tank.",
      [withPressure(dive(63))]
    ),
    // Dive 63 (32.66 m) on EANx36: about 1.54 bar at depth, over 1.4.
    "high-po2.uddf": file(
      "Dive 63 on EANx36, reaching a PO2 over 1.4 bar.",
      [dive(63).replaceAll("mix(32/0)", "mix(36/0)")],
      `    <mix id="mix(36/0)">\n      <name>EANx 36</name>\n      <o2>0.36</o2>\n      <he>0.00</he>\n    </mix>\n`
    ),
  }
}

if (import.meta.main) {
  for (const [name, xml] of Object.entries(generate())) {
    writeFileSync(new URL(name, import.meta.url), xml)
  }
}
