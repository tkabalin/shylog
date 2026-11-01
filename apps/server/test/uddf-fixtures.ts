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
