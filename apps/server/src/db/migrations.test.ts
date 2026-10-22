import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { gunzipSync } from "node:zlib"

import { describe, expect, it, onTestFinished } from "vitest"

import { checkIntegrity } from "../integrity.ts"
import { migrate, migrations, schemaVersion } from "./migrate.ts"
import { openDatabase } from "./open.ts"

// A nightly snapshot of the owner's instance, copied here by hand and kept
// out of git; CI and fresh clones skip the test.
const real = fileURLToPath(
  new URL("../../../../fixtures/real/shylog.db.gz", import.meta.url)
)

describe.skipIf(!existsSync(real))("migrations on the real database", () => {
  it("brings a copy up to date with its foreign keys whole", () => {
    const dir = mkdtempSync(join(tmpdir(), "shylog-migrations-"))
    const file = join(dir, "shylog.db")
    writeFileSync(file, gunzipSync(readFileSync(real)))
    const db = openDatabase(file)
    onTestFinished(() => {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    })

    migrate(db, dir)
    expect(schemaVersion(db)).toBe(migrations.at(-1)?.version)
    expect(db.pragma("foreign_key_check")).toEqual([])
    expect(checkIntegrity(db)).toBe("ok")
  })
})
