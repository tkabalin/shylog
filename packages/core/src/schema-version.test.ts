import { expect, it } from "vitest"

import { latestSchemaVersion } from "./schema-version.ts"

// The server's db.test.ts checks it against the migrations.
it("is a migration number", () => {
  expect(Number.isInteger(latestSchemaVersion)).toBe(true)
  expect(latestSchemaVersion).toBeGreaterThan(0)
})
