import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import type { Log } from "../src/routes/log.ts"
import { convertSsi } from "./ssi/convert.ts"
import { preflight } from "./ssi/preflight.ts"

// One-off: `pnpm --filter @shylog/server ssi-import <ssi.csv> <extras.json>
// <origin> [--dry-run]` uploads the MySSI logbook CSV to an instance as
// offline drafts, the way the phone uploads a dive. The extras file (see
// `extrasSchema`) holds site regions, people to leave out and per-dive
// fixes; the CSV and it are personal and stay out of the repo.
const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const [csv, extras, origin] = args.filter((arg) => arg !== "--dry-run")
if (!csv || !extras || !origin)
  throw new Error(
    "Usage: ssi-import <ssi.csv> <extras.json> <origin> [--dry-run]"
  )
// pnpm runs this from apps/server; INIT_CWD is where it was typed.
const local = (path: string) =>
  resolve(process.env.INIT_CWD ?? process.cwd(), path)

const { drafts, freedives, skipped } = convertSsi(
  readFileSync(local(csv), "utf8"),
  JSON.parse(readFileSync(local(extras), "utf8")),
  new Date().toISOString()
)

// What the app sends; Tailscale Serve adds the login.
async function api(path: string, body?: unknown) {
  const response = await fetch(new URL(path, origin), {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "X-Shylog": "1",
      Origin: new URL(origin).origin,
      ...(body !== undefined && { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  // A proxy's HTML page parses as nothing, which the tally reports.
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null,
  }
}

const dive = (draft: (typeof drafts)[number]) =>
  draft.ops.find((op) => op.type === "upsertDive")!
const startOf = (draft: (typeof drafts)[number]) => dive(draft).fields.startTime

if (!drafts.length) {
  console.log(
    `No scuba dives to send; ${skipped} skipped, ${freedives} freedives left out`
  )
  process.exit()
}

const log = await api("/api/log")
if (log.status !== 200 || !log.body)
  throw new Error(`GET /api/log: ${log.status} ${JSON.stringify(log.body)}`)
const plan = preflight(drafts, log.body as unknown as Log)

const count = (kind: string) =>
  new Set(
    drafts.flatMap((draft) =>
      draft.ops.flatMap((op) =>
        op.type === "upsertEntity" && op.kind === kind ? [op.id] : []
      )
    )
  ).size
console.log(
  `${drafts.length} dives from ${startOf(drafts[0]!)} to ${startOf(drafts.at(-1)!)}, ` +
    `${count("site")} sites, ${count("region")} regions, ${count("person")} people; ` +
    `${skipped} skipped, ${freedives} freedives left out`
)
for (const { diveId, startTime, differences } of plan.uploaded)
  if (differences.length)
    console.log(
      `${diveId} at ${startTime} is already uploaded; change ${differences.join(", ")} in the app`
    )
for (const { diveId, startTime } of plan.deleted)
  console.log(`${diveId} at ${startTime} is in Recently deleted, not sent`)
for (const { ssi, logged } of plan.deletedClashes)
  console.log(
    `${ssi.diveId} at ${ssi.startTime} overlaps ${logged.diveId} in Recently deleted: don't restore it`
  )
for (const { ssi, logged } of plan.clashes)
  console.log(
    `${ssi.diveId} at ${ssi.startTime} overlaps ${logged.diveId} at ${logged.startTime}`
  )
console.log(
  `${plan.send.length} to send, ${plan.uploaded.length} already uploaded`
)

if (plan.clashes.length) {
  process.exitCode = 1
  console.log(
    "Nothing sent: delete the other dive, or skip the SSI one in the extras"
  )
} else if (!dryRun) {
  const tally: Record<string, number> = {}
  for (const draft of plan.send) {
    // Reported and passed over, so one failure doesn't hide the rest; a
    // rerun sends only what didn't arrive.
    const reply = await api("/api/ops", draft).catch((error: unknown) => ({
      status: 0,
      body: { error: String(error) } as Record<string, unknown> | null,
    }))
    const result = reply.status === 200 ? reply.body?.result : undefined
    const outcome =
      typeof result === "string" ? result : `failed (${reply.status})`
    tally[outcome] = (tally[outcome] ?? 0) + 1
    if (typeof result !== "string") {
      process.exitCode = 1
      console.log(
        `${dive(draft).diveId} at ${startOf(draft)}: ${JSON.stringify(reply.body)}`
      )
    }
  }
  console.log(tally)
}
