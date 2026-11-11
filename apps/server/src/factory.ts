import { createFactory } from "hono/factory"

import type { Db } from "./db/open.ts"
import type { Env } from "./env.ts"
import type { Integrity } from "./integrity.ts"

export interface Deps {
  db: Db
  env: Env
  // Null for an in-memory database, which has no WAL file.
  dbFile: string | null
  // The built web app (apps/web/dist).
  webRoot: string
  state: { integrity: Integrity }
}

export interface Variables {
  deps: Deps
  // Why the request was refused, for its log line.
  refusal?: string
}

// Shared by the app and its route modules, so handlers see `c.var.deps`.
export const factory = createFactory<{ Variables: Variables }>()
