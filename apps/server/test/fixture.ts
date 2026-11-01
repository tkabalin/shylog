import { seed } from "../src/seed.ts"
import { testDb } from "./db.ts"
import { d4iXml } from "./uddf-fixtures.ts"

export const fixtureXml = d4iXml

// Fixture dives by Subsurface's divenumber, as start times, since Shylog
// numbers them differently once the freedives are left out.
export const fixtureStart = {
  1: "2019-02-10T11:01:29",
  2: "2019-02-10T11:46:40",
  3: "2019-06-15T10:09:23",
  6: "2021-02-18T09:45:24",
  36: "2026-01-14T11:33:50",
  52: "2026-07-17T08:02:44",
  54: "2026-07-18T08:39:26",
  58: "2026-07-20T08:05:44",
  61: "2026-07-21T07:47:42",
  63: "2026-07-22T08:12:19",
}

export function seededDb() {
  const db = testDb()
  seed(db, fixtureXml, "d4i-2026-10-12.uddf")
  return db
}

export const diveId = (
  db: ReturnType<typeof testDb>,
  n: keyof typeof fixtureStart
) =>
  db
    .prepare("SELECT id FROM dives WHERE start_time = ?")
    .pluck()
    .get(fixtureStart[n]) as string
