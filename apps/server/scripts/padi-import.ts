import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import type { Log } from "../src/routes/log.ts"
import { convertPadi } from "./padi/convert.ts"
import { applyPlan, planPadi, type Api } from "./padi/plan.ts"

// One-off: `pnpm --filter @shylog/server padi-import <padi.json>
// <extras.json> <origin> [--dry-run]` fills in the dives an instance's dive
// computer import brought in from the diver's PADI app logbook, and adds the
// dives only PADI has. The export and extras (see `extrasSchema`) are
// personal and stay out of the repo.
const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const [json, extras, origin] = args.filter((arg) => arg !== "--dry-run")
if (!json || !extras || !origin)
  throw new Error(
    "Usage: padi-import <padi.json> <extras.json> <origin> [--dry-run]"
  )
// pnpm runs this from apps/server; INIT_CWD is where it was typed.
const local = (path: string) =>
  resolve(process.env.INIT_CWD ?? process.cwd(), path)

// What the app sends; Tailscale Serve adds the login.
const api: Api = async (method, path, body) => {
  const response = await fetch(new URL(path, origin), {
    method,
    headers: {
      "X-Shylog": "1",
      Origin: new URL(origin).origin,
      ...(body !== undefined && { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  // A proxy's HTML page parses as nothing, which the report shows.
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null,
  }
}

const converted = convertPadi(
  JSON.parse(readFileSync(local(json), "utf8")),
  JSON.parse(readFileSync(local(extras), "utf8"))
)
const log = await api("GET", "/api/log")
if (log.status !== 200 || !log.body)
  throw new Error(`GET /api/log: ${log.status} ${JSON.stringify(log.body)}`)
const plan = planPadi(
  converted,
  log.body as unknown as Log,
  new Date().toISOString()
)

for (const entity of plan.entities)
  console.log(`New ${entity.kind}: ${entity.fields.name}`)
for (const { padi, dive, fields, kept } of plan.patches) {
  const sets = Object.keys(fields)
  console.log(
    `${padi.label} → the dive at ${dive.startTime}: ${sets.length ? `sets ${sets.join(", ")}` : "nothing to set"}`
  )
  if (kept.length)
    console.log(
      `  kept as set in the app (compare with PADI): ${kept.join(", ")}`
    )
}
for (const { padi } of plan.drafts)
  console.log(`${padi.label} → a new dive at ${padi.startTime}`)
for (const { padi } of plan.deleted)
  console.log(`${padi.label} is in Recently deleted, not sent`)
console.log(
  `${plan.patches.length} matched, ${plan.drafts.length} new, ${plan.entities.length} entities to create; ${converted.skipped} skipped`
)

if (!dryRun) {
  const { tally, failures } = await applyPlan(plan, api)
  for (const failure of failures) console.log(failure)
  if (failures.length) process.exitCode = 1
  console.log(tally)
}
