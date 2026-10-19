import { mkdirSync, readFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { migrate } from "../src/db/migrate.ts"
import { openDatabase } from "../src/db/open.ts"
import { seed } from "../src/seed.ts"

// Dev only: `pnpm seed [export.uddf]` loads a Subsurface export, the D4i
// fixture by default, into the empty log in SHYLOG_DATA_DIR. It is not part
// of the build, and refuses a log that already has dives.
// pnpm runs this from apps/server; INIT_CWD is where it was typed, or the
// repo root when typed in a folder with no package.json.
const file = process.argv[2]
  ? resolve(process.env.INIT_CWD ?? process.cwd(), process.argv[2])
  : fileURLToPath(
      new URL(
        "../../../fixtures/subsurface/d4i-2026-10-12.uddf",
        import.meta.url
      )
    )
const dataDir = process.env.SHYLOG_DATA_DIR
if (!dataDir) throw new Error("Set SHYLOG_DATA_DIR, as in .env.example")

mkdirSync(dataDir, { recursive: true })
const db = openDatabase(join(dataDir, "shylog.db"))
migrate(db, dataDir)
const count = seed(db, readFileSync(file, "utf8"), basename(file))
db.close()
console.log(`Seeded ${count} dives from ${basename(file)} into ${dataDir}`)
