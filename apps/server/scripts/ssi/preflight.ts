import {
  localSeconds,
  normaliseName,
  type UploadDraftRequest,
} from "@shylog/core"

import type { Log } from "../../src/routes/log.ts"

// What an upload would do to an instance, worked out from its /api/log
// before anything is sent, since the server skips op ids it has already
// applied and would take a changed draft as done.

type Draft = UploadDraftRequest
type Dive = Log["dives"][number]

interface Logged {
  diveId: string
  startTime: string
}

export interface Plan {
  // New dives, to send.
  send: Draft[]
  // Already uploaded: a resend changes nothing, so each value the draft
  // now holds differently is named for the diver to change in the app.
  uploaded: (Logged & { differences: string[] })[]
  // In Recently deleted, where a resend would be refused.
  deleted: Logged[]
  // Another dive at the same time as an SSI one, which would double it;
  // the run stops for the diver to delete one copy or skip the SSI one.
  clashes: { ssi: Logged; logged: Logged }[]
  // The same, with the other dive in Recently deleted: restoring it later
  // would double the dive, so it is only a warning.
  deletedClashes: { ssi: Logged; logged: Logged }[]
}

// The fields the converter can send, compared as stored.
const compared = [
  "startTime",
  "duration",
  "maxDepth",
  "averageDepth",
  "diveType",
  "trainingAgency",
  "trainingCourse",
  "entry",
  "current",
  "surface",
  "weather",
  "minTemperature",
  "maxTemperature",
  "visibility",
  "weight",
  "cylinderMaterial",
  "cylinderVolume",
  "nitrox",
  "oxygen",
  "startPressure",
  "endPressure",
  "gearDetails",
  "notes",
] as const

const diveOp = (draft: Draft) =>
  draft.ops.find((op) => op.type === "upsertDive")!

const names = (list: (string | undefined)[]) =>
  list
    .map((name) => normaliseName(name ?? ""))
    .sort()
    .join("\n")

// Two dives at once, as [start, start + duration) on the site's clock.
const overlaps = (
  a: { startTime: string; duration: number },
  b: { startTime: string; duration: number }
) => {
  const aStart = localSeconds(a.startTime)
  const bStart = localSeconds(b.startTime)
  return aStart < bStart + b.duration && bStart < aStart + a.duration
}

export function preflight(drafts: Draft[], log: Log): Plan {
  const ours = new Set<string>(drafts.map((draft) => diveOp(draft).diveId))
  const byId = new Map(log.dives.map((dive) => [dive.id, dive]))
  const plan: Plan = {
    send: [],
    uploaded: [],
    deleted: [],
    clashes: [],
    deletedClashes: [],
  }

  for (const draft of drafts) {
    const { diveId, fields } = diveOp(draft)
    const ssi = { diveId, startTime: fields.startTime }
    const stored = byId.get(diveId)
    if (stored?.deletedAt != null) plan.deleted.push(ssi)
    else if (stored)
      plan.uploaded.push({
        ...ssi,
        differences: differences(draft, stored, log),
      })
    else plan.send.push(draft)

    for (const other of log.dives) {
      if (ours.has(other.id) || !overlaps(fields, other)) continue
      const logged = { diveId: other.id, startTime: other.startTime }
      ;(other.deletedAt == null ? plan.clashes : plan.deletedClashes).push({
        ssi,
        logged,
      })
    }
  }
  return plan
}

function differences(draft: Draft, stored: Dive, log: Log) {
  const { fields } = diveOp(draft)
  const changed: string[] = compared.filter((field) => {
    const sent = fields[field] ?? null
    return sent !== (stored[field] ?? null)
  })

  // Entities by name, as the server may hold them under an alias's survivor.
  const sentName = (id: string) =>
    draft.ops.flatMap((op) =>
      op.type === "upsertEntity" && op.id === id ? [op.fields.name] : []
    )[0]
  const siteName = log.sites.find((site) => site.id === stored.siteId)?.name
  if (names([sentName(fields.siteId)]) !== names([siteName]))
    changed.push("site")

  const links = log.links.filter((link) => link.diveId === stored.id)
  const buddies = links
    .filter((link) => link.type === "buddy")
    .map((link) => log.people.find((person) => person.id === link.target)?.name)
  if (names((fields.buddies ?? []).map(sentName)) !== names(buddies))
    changed.push("buddies")
  const tags = links.filter((link) => link.type === "tag").map((l) => l.target)
  if (names(fields.tags ?? []) !== names(tags)) changed.push("tags")
  return changed
}
