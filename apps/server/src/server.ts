import { mkdirSync } from "node:fs"
import { join } from "node:path"

import { createApp } from "./app.ts"
import { migrate } from "./db/migrate.ts"
import { openDatabase } from "./db/open.ts"
import type { Env } from "./env.ts"
import { checkIntegrity } from "./integrity.ts"
import { defaultWebRoot } from "./static.ts"

// Opens the instance's database, checks it, migrates it and builds the app.
// A database that fails its check is not migrated: it is served read-only
// until it is restored.
export function boot(env: Env, webRoot = defaultWebRoot) {
  mkdirSync(env.SHYLOG_DATA_DIR, { recursive: true })
  const dbFile = join(env.SHYLOG_DATA_DIR, "shylog.db")
  const db = openDatabase(dbFile)
  const state = { integrity: checkIntegrity(db) }
  if (state.integrity === "ok") migrate(db, env.SHYLOG_DATA_DIR)
  const app = createApp({ db, env, dbFile, webRoot, state })
  return { app, db, state }
}
