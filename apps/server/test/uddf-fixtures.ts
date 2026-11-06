import { readFileSync } from "node:fs"

// The real Subsurface exports, without fixture.ts's database helpers, so
// tests that only read UDDF don't load SQLite.
const read = (name: string) =>
  readFileSync(
    new URL(`../../../fixtures/subsurface/${name}`, import.meta.url),
    "utf8"
  )

export const d4iXml = read("d4i-2026-10-12.uddf")
export const zoopXml = read("zoop-novo-2026-11-01.uddf")

// Start times by the export's own divenumber, which the plan's tests use to
// name dives (Shylog numbers them differently once freedives are left out).
export function fixtureStarts(xml: string) {
  return new Map(
    Array.from(
      xml.matchAll(
        /<divenumber>(\d+)<\/divenumber>\s*<datetime>([^<]+)<\/datetime>/g
      ),
      ([, number, start]) => [Number(number), start] as const
    )
  )
}

// Looks up a read dive by the export's divenumber.
export function byFixtureNumber<T extends { startTime: string }>(
  xml: string,
  dives: readonly T[]
) {
  const starts = fixtureStarts(xml)
  return (n: number) => dives.find((dive) => dive.startTime === starts.get(n))!
}
