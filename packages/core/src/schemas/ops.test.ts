import { describe, expect, it } from "vitest"

import { opSchema, opVersion, uploadDraftRequest } from "./ops.ts"

const base = {
  opVersion,
  deviceId: "device-phone",
  at: "2026-07-22T10:02:11.000Z",
}

const upsertDive = {
  ...base,
  opId: "op-1",
  type: "upsertDive",
  diveId: "dive-63",
  fields: {
    startTime: "2026-07-22T08:41:20",
    siteId: "site-two-mile",
    duration: 2520,
    maxDepth: 32.66,
  },
}

const upsertSite = {
  ...base,
  opId: "op-2",
  type: "upsertEntity",
  kind: "site",
  id: "site-two-mile",
  fields: { name: "Two Mile Reef", countryCode: "ZA" },
}

describe("opSchema", () => {
  it("accepts a dive and an entity", () => {
    expect(opSchema.safeParse(upsertDive).success).toBe(true)
    expect(opSchema.safeParse(upsertSite).success).toBe(true)
  })

  it.each(["startTime", "siteId", "duration", "maxDepth"])(
    "rejects an upsertDive without %s",
    (field) => {
      const fields = { ...upsertDive.fields, [field]: undefined }
      expect(opSchema.safeParse({ ...upsertDive, fields }).success).toBe(false)
    }
  )

  it("needs a positive whole opVersion", () => {
    for (const version of [0, -1, 1.5, "1"]) {
      expect(
        opSchema.safeParse({ ...upsertDive, opVersion: version }).success
      ).toBe(false)
    }
    expect(opSchema.safeParse({ ...upsertDive, opVersion: 2 }).success).toBe(
      true
    )
  })

  it("needs ids that start with a letter and are valid UDDF ids", () => {
    for (const diveId of ["63", "dive 63", "dive-é", "site-63"]) {
      expect(opSchema.safeParse({ ...upsertDive, diveId }).success).toBe(false)
    }
    expect(opSchema.safeParse({ ...upsertDive, opId: "1" }).success).toBe(false)
  })

  it("checks an entity's fields and id against its kind", () => {
    expect(
      opSchema.safeParse({ ...upsertSite, fields: { name: "Two Mile Reef" } })
        .success
    ).toBe(false)
    expect(opSchema.safeParse({ ...upsertSite, kind: "person" }).success).toBe(
      false
    )
    expect(opSchema.safeParse({ ...upsertSite, kind: "tank" }).success).toBe(
      false
    )
  })

  it("needs a timestamp with a zone, for the age rule", () => {
    expect(
      opSchema.safeParse({ ...upsertDive, at: "2026-07-22T12:02:11+02:00" })
        .success
    ).toBe(true)
    expect(
      opSchema.safeParse({ ...upsertDive, at: "2026-07-22T10:02:11" }).success
    ).toBe(false)
  })
})

describe("uploadDraftRequest", () => {
  it("takes one dive with the entities it creates", () => {
    expect(
      uploadDraftRequest.safeParse({ ops: [upsertSite, upsertDive] }).success
    ).toBe(true)
  })

  it("rejects a draft with no dive or two", () => {
    expect(uploadDraftRequest.safeParse({ ops: [upsertSite] }).success).toBe(
      false
    )
    expect(
      uploadDraftRequest.safeParse({
        ops: [upsertDive, { ...upsertDive, opId: "op-3", diveId: "dive-64" }],
      }).success
    ).toBe(false)
  })

  it("rejects repeated op ids", () => {
    expect(
      uploadDraftRequest.safeParse({
        ops: [upsertDive, { ...upsertSite, opId: "op-1" }],
      }).success
    ).toBe(false)
  })
})
