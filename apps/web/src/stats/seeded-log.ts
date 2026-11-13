// Test only: the log the phone holds after syncing a server seeded with the
// D4i fixture, read through the app's own sync and mirror, so Statistics is
// tested on real dives as the e2e stack seeds them.
import { apiHeaders, testApp } from "../../../server/test/app"
import { seededDb } from "../../../server/test/fixture"

import { LogDb } from "@/data/db"
import { QueueDb } from "@/data/drafts"
import { readLog } from "@/data/log"
import { syncLog } from "@/data/sync"

// Run in Vitest's node environment, as the server reads its files by file
// URL, which jsdom's import.meta.url isn't; the API client needs an origin.
export async function seededLog() {
  globalThis.location ??= { origin: "http://localhost" } as Location
  const app = testApp({ db: seededDb() })
  const name = `stats-${crypto.randomUUID()}`
  const db = new LogDb(name)
  await syncLog({
    db,
    fetch: async (input, init) =>
      app.request(String(input), {
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(init?.headers)),
          ...apiHeaders,
        },
      }),
  })
  const { log } = await readLog(db, new QueueDb(`${name}-queue`))
  return log!
}
