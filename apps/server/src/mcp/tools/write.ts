import type { McpServer } from "@modelcontextprotocol/server"
import {
  bodiesOfWater,
  diveRoles,
  entityKinds,
  keysOf,
  localSeconds,
  mergeEntityRequests,
  newId,
  opVersion,
  patchDiveRequest,
  setEntityDivesRequests,
  uploadDraftRequest,
  waterTypes,
  type ComparedField,
  type DiveSetKind,
} from "@shylog/core"
import { z } from "zod"

import { applyDraft } from "../../apply/draft.ts"
import {
  feedsDiveFigures,
  missing,
  resolve,
  tables,
} from "../../apply/entity.ts"
import { Rejected } from "../../apply/rejected.ts"
import { readSettings } from "../../apply/settings.ts"
import type { Db } from "../../db/open.ts"
import { prepared } from "../../db/prepared.ts"
import {
  applyDiveEdit,
  applyEntityDives,
  applyEntityMerge,
  applyEntityPut,
  type Journal,
} from "../../edits.ts"
import type { Deps } from "../../factory.ts"
import { savingPaused } from "../../integrity.ts"
import { currentVersion } from "../../journal.ts"
import { changeBy } from "../../routes/change.ts"
import { readLog } from "../../routes/log.ts"
import { parse } from "../../validate.ts"
import { entityRefs, nameOf, type NewEntity } from "../refs.ts"
import { addTool } from "../tool.ts"
import {
  countryCode,
  diveChangesInput,
  newDiveInput,
  storedFields,
  type DiveChangesInput,
} from "../units.ts"
import { diveDetail, indexLog, minutes } from "../view.ts"

// The compared fields under the tools' names.
const compared = {
  startTime: "startTime",
  maxDepthM: "maxDepth",
  averageDepthM: "averageDepth",
  durationMin: "duration",
  minTemperatureC: "minTemperature",
  maxTemperatureC: "maxTemperature",
  oxygenPercent: "oxygen",
} as const satisfies Record<string, ComparedField>
const comparedInput = z.array(
  z.enum(Object.keys(compared) as (keyof typeof compared)[])
)

const idRef = z.object({ id: z.string() })

// Core drops training details from any other dive without a word, so
// Claude is told instead.
function refuseTraining(input: DiveChangesInput, diveType: string) {
  if (
    (input.trainingAgency || input.trainingCourse) &&
    diveType !== "training"
  ) {
    throw new Rejected(
      'Training details go only on a training dive: set diveType to "training" too',
      422,
      ["trainingAgency"]
    )
  }
}

// The dive's people, site, centre and trip as stored ids, making any new
// ones in the same call (see refs.ts).
function linkFields(
  refs: ReturnType<typeof entityRefs>,
  input: DiveChangesInput
) {
  const out: Record<string, unknown> = {}
  if (input.site) out.siteId = refs.site(input.site)
  if (input.trip !== undefined) out.tripId = input.trip && refs.trip(input.trip)
  if (input.diveCentre !== undefined) {
    out.diveCentreId = input.diveCentre && refs.diveCentre(input.diveCentre)
  }
  if (input.buddies !== undefined) {
    out.buddies = input.buddies && input.buddies.map(refs.person)
  }
  if (input.professionals !== undefined) {
    out.diveProfessionals =
      input.professionals && input.professionals.map(refs.person)
  }
  return out
}

// Refuses a dive sharing time with a live one, ignored ones included: a
// retry of log_dive, or a dive the computer import already added. A dive
// being edited doesn't clash with itself.
function refuseOverlap(
  db: Db,
  startTime: string,
  duration: number,
  self?: string
) {
  const clash = overlapping(db, startTime, duration, self)
  if (!clash) return
  const which = clash.number
    ? `dive ${clash.number}`
    : `an ignored dive on ${clash.startTime.slice(0, 10)}`
  throw new Rejected(
    `This overlaps ${which} (${clash.site}, ${clash.startTime} for ${minutes(clash.duration)} min, id ${clash.id}). If it is the same dive, change that one with edit_dive.`,
    409,
    ["startTime"]
  )
}

function overlapping(
  db: Db,
  startTime: string,
  duration: number,
  self?: string
) {
  const start = localSeconds(startTime)
  const end = start + duration
  const dives = prepared<
    [],
    {
      id: string
      number: number | null
      startTime: string
      duration: number
      site: string
    }
  >(
    db,
    `SELECT d.id, d.number, d.start_time AS startTime, d.duration, s.name AS site
     FROM dives d JOIN sites s ON s.id = d.site_id WHERE d.deleted_at IS NULL`
  ).all()
  return dives.find((dive) => {
    const from = localSeconds(dive.startTime)
    return dive.id !== self && from < end && start < from + dive.duration
  })
}

// Live dives' numbers, to tell when an edit renumbered others.
const numbers = (db: Db) =>
  new Map(
    prepared<[], { id: string; number: number | null }>(
      db,
      "SELECT id, number FROM dives WHERE deleted_at IS NULL"
    )
      .all()
      .map((row) => [row.id, row.number])
  )

// How many live dives a trip, centre or person is on, for assign_dives.
const divesOn = {
  trip: "SELECT count(*) FROM dives WHERE trip_id = :id AND deleted_at IS NULL",
  diveCentre:
    "SELECT count(*) FROM dives WHERE dive_centre_id = :id AND deleted_at IS NULL",
  person: `SELECT count(*) FROM dives WHERE deleted_at IS NULL AND id IN (
    SELECT dive_id FROM dive_buddies WHERE person_id = :id
    UNION SELECT dive_id FROM dive_professionals WHERE person_id = :id)`,
} satisfies Record<DiveSetKind, string>

const steps =
  (db: Db, created: NewEntity[], then: (journal: Journal) => boolean) =>
  (journal: Journal) => {
    let changed = false
    for (const entity of created) {
      changed =
        applyEntityPut(db, journal, entity.kind, entity.id, entity.fields) ||
        changed
    }
    return then(journal) || changed
  }

// Detail fields a change can't move by itself, left out of before and after.
const derived = new Set([
  "id",
  "figures",
  "sources",
  "safetyStop",
  "ascentAlarms",
  "computerModel",
])

function differences(
  before: Record<string, unknown>,
  after: Record<string, unknown>
) {
  // A detail leaves out false, so a flag turned off reads false, not null.
  const side = (value: unknown, other: unknown) =>
    value ?? (typeof other === "boolean" ? false : null)
  const out: Record<string, { before: unknown; after: unknown }> = {}
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (derived.has(key)) continue
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      out[key] = {
        before: side(before[key], after[key]),
        after: side(after[key], before[key]),
      }
    }
  }
  return out
}

export function writeTools(server: McpServer, deps: Deps) {
  const { db } = deps
  // Whether a write changed anything: one that doesn't journals nothing,
  // so the version stays.
  const wrote = (write: () => unknown) => {
    const before = currentVersion(db)
    write()
    return currentVersion(db) !== before
  }
  const writable = () => {
    if (deps.state.integrity === "failed") throw new Rejected(savingPaused, 503)
  }
  const detail = (id: string) => {
    const index = indexLog(readLog(db))
    const dive = index.log.dives.find((d) => d.id === id)
    if (!dive) throw new Rejected("No dive has that id", 404)
    return diveDetail(index, dive) as Record<string, unknown>
  }

  addTool(server, "log_dive", {
    title: "Log a dive",
    description:
      "Log a new dive the diver describes, as the app's New dive form does. startTime, site, durationMin and maxDepthM are required. The site, buddies, professionals, dive centre and trip are each an existing { id } from list_entities, or { new: … }, which is matched by name to one that exists before anything is made. The log's new-dive defaults (cylinder, weight, dive type) fill what is left out; null leaves one empty. A dive that overlaps one already logged is refused. Returns the dive's number and id.",
    input: newDiveInput,
    hints: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
    run(input) {
      writable()
      const defaults = readSettings(db).newDiveDefaults
      const fields: Record<string, unknown> = storedFields(input)
      // As the form fills them: only what the diver left out.
      if (input.diveType === undefined && defaults.diveType) {
        fields.diveType = defaults.diveType
      }
      const kit = {
        cylinderMaterial: "cylinderMaterial",
        cylinderVolumeL: "cylinderVolume",
        weightKg: "weight",
      } as const
      for (const [param, field] of Object.entries(kit)) {
        if (input[param as keyof typeof kit] === undefined) {
          fields[field] = defaults[field]
        }
      }
      refuseTraining(input, (fields.diveType as string) ?? "recreation")

      const refs = entityRefs(db)
      Object.assign(fields, linkFields(refs, input))

      const op = () => ({
        opId: newId("op"),
        opVersion,
        deviceId: "device-mcp",
        at: new Date().toISOString(),
      })
      const id = newId("dive")
      const { ops } = parse(uploadDraftRequest, {
        ops: [
          ...refs.created().map((entity) => ({
            ...op(),
            type: "upsertEntity",
            ...entity,
          })),
          { ...op(), type: "upsertDive", diveId: id, fields },
        ],
      })
      // Once the time is known to be real, as a day that doesn't exist
      // would be read as one later.
      refuseOverlap(db, fields.startTime as string, fields.duration as number)
      applyDraft(db, ops)

      const number = prepared(db, "SELECT number FROM dives WHERE id = ?")
        .pluck()
        .get(id) as number | null
      const later = number
        ? (prepared(
            db,
            "SELECT count(*) FROM dives WHERE number > ? AND deleted_at IS NULL"
          )
            .pluck()
            .get(number) as number)
        : 0
      return {
        number,
        id,
        entities: refs.outcome(),
        ...(later
          ? {
              note: `Logged before ${later} later dive${later === 1 ? "" : "s"}, whose numbers each moved up by one.`,
            }
          : {}),
      }
    },
  })

  addTool(server, "edit_dive", {
    title: "Edit a dive",
    description:
      "Change a dive, by its id (get_dive and search_dives give it). Send only the fields to change; null clears an optional one. buddies, professionals and tags replace the whole list, so to add someone to dives without dropping the others use assign_dives. A surfaceIntervalMin sets the interval by hand; null returns it to the calculated one. adopt takes the dive computer's reading for a field; dismiss keeps the diver's own value and stops the comparison. Returns each changed field before and after.",
    input: diveChangesInput.extend({
      id: z.string().describe("The dive's id"),
      adopt: comparedInput.optional(),
      dismiss: comparedInput.optional(),
    }),
    hints: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    run({ id, adopt, dismiss, ...input }) {
      writable()
      const before = detail(id)
      const stored = prepared<
        [string],
        {
          startTime: string
          duration: number
          surfaceInterval: number | null
          override: number
        }
      >(
        db,
        "SELECT start_time AS startTime, duration, surface_interval AS surfaceInterval, surface_interval_override AS override FROM dives WHERE id = ?"
      ).get(id)!
      refuseTraining(input, input.diveType ?? (before.diveType as string))
      const fields: Record<string, unknown> = storedFields(input)
      // The calculated interval sent back as get_dive showed it changes
      // nothing, rather than fixing it by hand.
      if (
        !stored.override &&
        fields.surfaceInterval !== undefined &&
        fields.surfaceInterval !== null &&
        (fields.surfaceInterval === "none"
          ? stored.surfaceInterval === null
          : fields.surfaceInterval === stored.surfaceInterval)
      ) {
        delete fields.surfaceInterval
      }
      // A dive has a visibility in metres or a rating, never both, so
      // setting one clears the other rather than being refused.
      if (input.visibilityM != null && input.visibilityRating === undefined) {
        fields.visibilityRating = null
      }
      if (input.visibilityRating != null && input.visibilityM === undefined) {
        fields.visibility = null
      }
      const refs = entityRefs(db)
      Object.assign(fields, linkFields(refs, input))
      // Everything sent was as stored, such as the calculated interval.
      const sent = Object.values(input).some((value) => value !== undefined)
      if (sent && !Object.keys(fields).length && !adopt && !dismiss) {
        return "No change"
      }
      const request = parse(patchDiveRequest, {
        ...(Object.keys(fields).length ? { fields } : {}),
        ...(adopt?.length ? { adopt: adopt.map((f) => compared[f]) } : {}),
        ...(dismiss?.length
          ? { dismiss: dismiss.map((f) => compared[f]) }
          : {}),
      })
      // Once the time is known to be real, as in log_dive, and only for a
      // time that moves, so a dive already overlapping one can still be
      // edited with its time sent back as get_dive showed it.
      const startTime =
        (fields.startTime as string | undefined) ?? stored.startTime
      const duration =
        (fields.duration as number | undefined) ?? stored.duration
      if (startTime !== stored.startTime || duration !== stored.duration) {
        refuseOverlap(db, startTime, duration, id)
      }
      const others = numbers(db)
      const changed = wrote(() =>
        changeBy(
          db,
          steps(db, refs.created(), (journal) =>
            applyDiveEdit(db, journal, id, request)
          )
        )
      )
      if (!changed) return "No change"
      const after = numbers(db)
      const renumbered = [...others].filter(
        ([other, number]) => other !== id && after.get(other) !== number
      ).length
      return {
        id,
        changes: differences(before, detail(id)),
        entities: refs.outcome(),
        ...(renumbered
          ? {
              note: `${renumbered} other dive${renumbered === 1 ? " was" : "s were"} renumbered.`,
            }
          : {}),
      }
    },
  })

  addTool(server, "edit_entity", {
    title: "Edit a site, person, centre, trip or region",
    description:
      "Change an existing site, region, person, dive centre or trip, by its id from list_entities: rename it, or change a site's country, region, body of water or water type, or a centre's region. It never makes a new one. A name another one already has is refused, naming it, so the two can be joined with merge_entities.",
    input: z.object({
      kind: z.enum(entityKinds),
      id: z.string(),
      name: z.string().optional(),
      countryCode: countryCode.optional().describe("Sites and regions"),
      regionId: z
        .string()
        .nullable()
        .optional()
        .describe("Sites and dive centres; null takes it out of its region"),
      bodyOfWater: z
        .enum(keysOf(bodiesOfWater))
        .nullable()
        .optional()
        .describe("Sites"),
      waterType: z.enum(keysOf(waterTypes)).optional().describe("Sites"),
    }),
    hints: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    run({ kind, id, ...changes }) {
      writable()
      // putEntity makes an entity under a new id, which only a dive may do.
      const known = prepared(db, `SELECT 1 FROM ${tables[kind]} WHERE id = ?`)
      if (known.get(id) === undefined) throw missing(db, kind, id)
      const sent = Object.fromEntries(
        Object.entries(changes).filter(([, value]) => value !== undefined)
      )
      const countryOf = () =>
        kind === "region" &&
        prepared(db, "SELECT country_code FROM regions WHERE id = ?")
          .pluck()
          .get(id)
      const country = countryOf()
      const changed = wrote(() =>
        changeBy(
          db,
          (journal) => applyEntityPut(db, journal, kind, id, sent),
          feedsDiveFigures(kind)
        )
      )
      if (!changed) return "No change"
      // Its sites move with a region's country, as on You.
      const moved =
        country !== countryOf()
          ? (prepared(db, "SELECT count(*) FROM sites WHERE region_id = ?")
              .pluck()
              .get(id) as number)
          : 0
      return {
        id,
        name: nameOf(db, kind, id),
        ...(moved
          ? {
              note: `Its ${moved} site${moved === 1 ? "" : "s"} moved to the new country too.`,
            }
          : {}),
      }
    },
  })

  addTool(server, "merge_entities", {
    title: "Merge two sites, people, centres, trips or regions",
    description:
      "Merge one site, region, person, dive centre or trip (id) into another (into): every dive, and for a region every site and centre, moves to the one kept, and the merged one's name is gone. It can't be undone. Regions merge only within one country.",
    input: z.object({
      kind: z.enum(entityKinds),
      id: z.string().describe("The one that goes"),
      into: z.string().describe("The one kept"),
    }),
    hints: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    },
    run({ kind, id, into }) {
      writable()
      parse(mergeEntityRequests[kind], { into })
      const merged = wrote(() =>
        changeBy(
          db,
          (journal) => applyEntityMerge(db, journal, kind, id, into),
          feedsDiveFigures(kind)
        )
      )
      if (!merged) return "Already merged"
      const kept = resolve(db, kind, into) ?? into
      return { into: { id: kept, name: nameOf(db, kind, kept) } }
    },
  })

  addTool(server, "assign_dives", {
    title: "Put dives on a trip, centre or person",
    description:
      "Put dives on a trip, a dive centre or a person (as buddy or professional), or take them off, in one change. Dives not named stay as they are, so this is also how to add one buddy to a dive without replacing the others. The trip, centre or person is an existing { id } or { new: { name } }, made with its first dives; it is never deleted when its last dive comes off.",
    input: z.object({
      kind: z.enum(["trip", "diveCentre", "person"]),
      target: z
        .union([
          idRef,
          z.object({
            new: z.object({
              name: z.string().min(1),
              region: idRef.optional().describe("Dive centres"),
            }),
          }),
        ])
        .describe("The trip, dive centre or person"),
      add: z.array(z.string()).default([]).describe("Dive ids to put on it"),
      remove: z
        .array(z.string())
        .default([])
        .describe("Dive ids to take off it"),
      role: z
        .enum(diveRoles)
        .optional()
        .describe(
          "A person's role on the dives added, needed for a person; one already on a dive takes this role there"
        ),
    }),
    hints: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    run({ kind, target, add, remove, role }) {
      writable()
      // Never assumed, as it would move an instructor to buddy unasked.
      if (kind === "person" && add.length && !role) {
        throw new Rejected(
          "Say whether they were a buddy or a dive professional on these dives",
          422,
          ["role"]
        )
      }
      const refs = entityRefs(db)
      if ("new" in target && target.new.region && kind !== "diveCentre") {
        throw new Rejected("Only a dive centre has a region", 422, ["target"])
      }
      const id =
        "id" in target
          ? target.id
          : kind === "diveCentre"
            ? refs.diveCentre(target)
            : kind === "trip"
              ? refs.trip({ new: { name: target.new.name } })
              : refs.person({ new: { name: target.new.name } })
      // A new one is made by the batch itself, as You's is, which also
      // refuses one with no dives.
      const [created] = refs.created()
      const setKind: DiveSetKind = kind
      const request = parse(setEntityDivesRequests[setKind], {
        ...(created ? { create: created.fields } : {}),
        add:
          kind === "person"
            ? add.map((diveId) => ({ diveId, role: role! }))
            : add,
        remove,
      })
      changeBy(db, (journal) =>
        applyEntityDives(db, journal, setKind, id, request)
      )
      // Dives put on a merged-away id land on the one kept, so report that.
      const kept = resolve(db, kind, id) ?? id
      const on = prepared(db, divesOn[kind]).pluck().get({ id: kept }) as number
      return {
        [kind]: {
          id: kept,
          name: refs.outcome()[0]?.name ?? nameOf(db, kind, kept),
        },
        dives: on,
        entities: refs.outcome(),
      }
    },
  })
}
