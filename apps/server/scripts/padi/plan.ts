import {
  entityCreateOrder,
  likelySame,
  localSeconds,
  normaliseName,
  opVersion,
  placeKey,
  uploadDraftRequest,
  type EntityKind,
  type UploadDraftRequest,
} from "@shylog/core"

import type { Log } from "../../src/routes/log.ts"
import { keyedId } from "../ids.ts"
import type { PadiDive, PadiSite } from "./convert.ts"

// Matches each PADI dive to the dive already in the log (the dive computer's,
// imported first) and plans the writes that fill in what PADI adds. Nothing
// the diver entered in the app is overwritten, and the computer keeps its
// times, depths, temperatures and gas.

type Dive = Log["dives"][number]

export interface Entity {
  kind: EntityKind
  id: string
  fields: Record<string, string>
}

export interface Patch {
  padi: PadiDive
  dive: Dive
  fields: Record<string, unknown>
  // Fields the diver set otherwise in the app, listed to compare with PADI.
  kept: string[]
}

export interface Plan {
  entities: Entity[]
  patches: Patch[]
  drafts: { padi: PadiDive; draft: UploadDraftRequest }[]
  deleted: { padi: PadiDive; diveId: string }[]
}

const padiDiveId = (padi: PadiDive) => `dive-padi-${padi.padiId}`

// Two dives at once, as [start, start + duration) on the site's clock.
const overlaps = (
  a: { startTime: string; duration: number },
  b: { startTime: string; duration: number }
) => {
  const aStart = localSeconds(a.startTime)
  const bStart = localSeconds(b.startTime)
  return aStart < bStart + b.duration && bStart < aStart + a.duration
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const empty = (value: unknown) =>
  value == null || (Array.isArray(value) && value.length === 0)

// `at` stamps the new dives' drafts, for the server's two-year age rule.
export function planPadi(
  converted: { dives: PadiDive[]; sites: Map<string, PadiSite> },
  log: Log,
  at: string
): Plan {
  const problems: string[] = []
  const entities: Entity[] = []

  // The log's own entity under that name, else a new one.
  function resolve(
    kind: EntityKind,
    key: string,
    existing: { id: string; key: string }[],
    fields: Record<string, string>
  ) {
    const id = keyedId("padi", kind, key)
    const found = existing.find(
      (entity) => entity.id === id || entity.key === key
    )
    if (found) return found.id
    if (!entities.some((entity) => entity.id === id))
      entities.push({ kind, id, fields })
    return id
  }
  const byName = (list: { id: string; name: string }[]) =>
    list.map(({ id, name }) => ({ id, key: normaliseName(name) }))
  const byPlace = (list: { id: string; name: string; countryCode: string }[]) =>
    list.map(({ id, name, countryCode }) => ({
      id,
      key: placeKey(name, countryCode),
    }))

  const siteIds = new Map<string, string>()
  for (const [key, site] of converted.sites) {
    const regionId =
      site.region &&
      resolve(
        "region",
        placeKey(site.region, site.countryCode),
        byPlace(log.regions),
        {
          name: site.region,
          countryCode: site.countryCode,
        }
      )
    siteIds.set(
      key,
      resolve("site", key, byPlace(log.sites), {
        name: site.name,
        countryCode: site.countryCode,
        ...(regionId && { regionId }),
        ...(site.bodyOfWater && { bodyOfWater: site.bodyOfWater }),
        ...(site.waterType && { waterType: site.waterType }),
      })
    )
  }
  const person = (name: string) =>
    resolve("person", normaliseName(name), byName(log.people), { name })
  const centre = (name: string) =>
    resolve("diveCentre", normaliseName(name), byName(log.diveCentres), {
      name,
    })

  const live = log.dives.filter((dive) => !dive.deletedAt)
  const claimed = new Map<string, PadiDive>()
  const patches: Patch[] = []
  const drafts: Plan["drafts"] = []
  const deleted: Plan["deleted"] = []

  for (const padi of converted.dives) {
    // What PADI says about the dive, as the log stores it.
    const wanted: Record<string, unknown> = {
      ...padi.fields,
      siteId: siteIds.get(padi.site),
      diveCentreId: padi.centre ? centre(padi.centre) : null,
      buddies: padi.buddies.map(person),
      diveProfessionals: padi.professionals.map(person),
    }

    // Sent before, as a new dive.
    const own = log.dives.find((dive) => dive.id === padiDiveId(padi))
    if (own?.deletedAt) {
      deleted.push({ padi, diveId: own.id })
      continue
    }
    const candidates = own
      ? [own]
      : live.filter(
          (dive) =>
            dive.startTime.slice(0, 10) === padi.date &&
            // PADI has no start time, so only depth and duration are judged.
            likelySame(
              {
                startTime: dive.startTime,
                duration: padi.duration,
                maxDepth: padi.maxDepth,
                averageDepth: null,
              },
              dive
            )
        )
    if (candidates.length > 1) {
      problems.push(
        `${padi.label} could be any of ${candidates.map((dive) => dive.startTime).join(", ")}`
      )
      continue
    }

    const [dive] = candidates
    if (dive) {
      const twin = claimed.get(dive.id)
      if (twin)
        problems.push(
          `${padi.label} and PADI dive ${twin.padiId} both match the dive at ${dive.startTime}`
        )
      claimed.set(dive.id, padi)
      patches.push(patchFor(padi, dive, wanted, log))
      continue
    }

    if (!padi.startTime) {
      problems.push(
        `${padi.label} matches no dive in the log: give its start time in the extras`
      )
      continue
    }
    const placed = { startTime: padi.startTime, duration: padi.duration }
    for (const other of live)
      if (overlaps(placed, other))
        problems.push(
          `${padi.label} at ${padi.startTime} overlaps the dive at ${other.startTime}`
        )
    const fields = Object.fromEntries(
      Object.entries({
        ...wanted,
        ...padi.computerFields,
        startTime: padi.startTime,
        duration: padi.duration,
        maxDepth: padi.maxDepth,
      }).filter(([, value]) => !empty(value))
    )
    const parsed = uploadDraftRequest.safeParse({
      ops: [
        {
          opId: `op-padi-${padi.padiId}-dive`,
          opVersion,
          deviceId: "device-padi-import",
          at,
          type: "upsertDive",
          diveId: padiDiveId(padi),
          fields,
        },
      ],
    })
    if (parsed.success) drafts.push({ padi, draft: parsed.data })
    else
      problems.push(
        `${padi.label}: ${parsed.error.issues.map((issue) => `${issue.path.slice(3).join(" ")}: ${issue.message}`).join("; ")}`
      )
  }

  if (problems.length) throw new Error(problems.join("\n"))
  const order = (entity: Entity) => entityCreateOrder.indexOf(entity.kind)
  return {
    entities: entities.toSorted((a, b) => order(a) - order(b)),
    patches,
    drafts,
    deleted,
  }
}

// Fills what the dive lacks, and replaces what the computer or nobody chose;
// a value the diver set in the app stays. Visibility in metres and as a
// rating are one choice, as are buddies and professionals, since the server
// refuses a dive holding both or the same person twice.
function patchFor(
  padi: PadiDive,
  dive: Dive,
  wanted: Record<string, unknown>,
  log: Log
): Patch {
  const hand = new Set(
    log.fieldMeta
      .filter((meta) => meta.diveId === dive.id && meta.source === "hand")
      .map((meta) => meta.field)
  )
  const people = (type: "buddy" | "professional") =>
    log.links
      .filter((link) => link.diveId === dive.id && link.type === type)
      .toSorted((a, b) => a.position - b.position)
      .map((link) => link.target)
  const current: Record<string, unknown> = {
    ...dive,
    buddies: people("buddy"),
    diveProfessionals: people("professional"),
  }
  const groups = [
    ["visibility", "visibilityRating"],
    ["buddies", "diveProfessionals"],
    ...Object.keys(wanted)
      .filter(
        (field) =>
          ![
            "visibility",
            "visibilityRating",
            "buddies",
            "diveProfessionals",
          ].includes(field)
      )
      .map((field) => [field]),
  ]

  const fields: Record<string, unknown> = {}
  const kept: string[] = []
  for (const group of groups) {
    if (group.every((field) => empty(wanted[field]))) continue
    if (
      group.every((field) =>
        same(current[field] ?? null, wanted[field] ?? null)
      )
    )
      continue
    // Buddies are only ever added to a dive that has none.
    const taken =
      group[0] === "buddies"
        ? group.some((field) => !empty(current[field]))
        : group.some((field) => hand.has(field) && !empty(current[field]))
    if (taken) {
      kept.push(...group.filter((field) => !empty(wanted[field])))
      continue
    }
    for (const field of group) {
      const value = wanted[field] ?? null
      // Clearing a field the dive doesn't have would be no change.
      if (!empty(value) || !empty(current[field])) fields[field] = value
    }
  }
  return { padi, dive, fields, kept }
}

export type Api = (
  method: string,
  path: string,
  body?: unknown
) => Promise<{ status: number; body: Record<string, unknown> | null }>

// Entities first, as the dives name them, so one failing stops the run. A
// dive failing is reported and the rest still sent; a rerun sends only what
// didn't arrive.
export async function applyPlan(plan: Plan, api: Api) {
  const failures: string[] = []
  const tally: Record<string, number> = {}
  const count = (outcome: string) =>
    (tally[outcome] = (tally[outcome] ?? 0) + 1)
  const call = async (
    what: string,
    method: string,
    path: string,
    body: unknown
  ) => {
    const reply = await api(method, path, body).catch((error: unknown) => ({
      status: 0,
      body: { error: String(error) } as Record<string, unknown> | null,
    }))
    if (reply.status !== 200)
      failures.push(`${what}: ${reply.status} ${JSON.stringify(reply.body)}`)
    return reply
  }

  for (const entity of plan.entities) {
    const reply = await call(
      `${entity.kind} ${entity.fields.name}`,
      "PUT",
      `/api/entities/${entity.kind}/${entity.id}`,
      entity.fields
    )
    if (reply.status !== 200) return { tally, failures }
    count(`${entity.kind} created`)
  }
  for (const { padi, dive, fields } of plan.patches) {
    if (!Object.keys(fields).length) continue
    const reply = await call(padi.label, "PATCH", `/api/dives/${dive.id}`, {
      fields,
    })
    if (reply.status === 200) count("dive filled in")
  }
  for (const { padi, draft } of plan.drafts) {
    const reply = await call(padi.label, "POST", "/api/ops", draft)
    const result = reply.body?.result
    if (reply.status === 200 && typeof result === "string")
      count(`new dive ${result}`)
  }
  return { tally, failures }
}
