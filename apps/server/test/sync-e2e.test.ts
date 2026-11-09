import { opVersion } from "@shylog/core"
import { describe, expect, it } from "vitest"

import type { Log } from "../src/routes/log.ts"
import { apiHeaders, send, testApp } from "./app.ts"

// The sync rules end to end, through the routes the phone calls: however
// messy the way drafts reach the server (resent, sent twice at once, sent
// again after an edit, pointing at a merged entity, or made on two phones),
// the log ends as one clean upload of the same dives leaves it.

type App = ReturnType<typeof testApp>
type Op = Record<string, unknown>

let opCount = 0
const op = (deviceId: string) => ({
  opId: `op-${++opCount}`,
  opVersion,
  deviceId,
  at: "2026-11-09T08:00:00.000Z",
})

const site = (deviceId: string, id: string) => ({
  ...op(deviceId),
  type: "upsertEntity",
  kind: "site",
  id,
  fields: { name: "Two Mile Reef", countryCode: "ZA" },
})

const person = (deviceId: string, id: string) => ({
  ...op(deviceId),
  type: "upsertEntity",
  kind: "person",
  id,
  fields: { name: "Sam Naidoo" },
})

const dive = (
  deviceId: string,
  diveId: string,
  fields: Record<string, unknown> = {}
) => ({
  ...op(deviceId),
  type: "upsertDive",
  diveId,
  fields: {
    startTime: "2026-11-08T09:00:00",
    siteId: "site-reef",
    duration: 2520,
    maxDepth: 18.4,
    ...fields,
  },
})

async function upload(app: App, ops: Op[]) {
  const res = await send(app, "POST", "/api/ops", { ops })
  expect(res.status).toBe(200)
  return ((await res.json()) as { result: string }).result
}

// What every phone mirrors, without the version and time, which differ
// with the number of writes rather than with the data.
async function finalLog(app: App) {
  const res = await app.request("/api/log", { headers: apiHeaders })
  const { version, serverTime, ...log } = (await res.json()) as Log
  void version
  void serverTime
  return log
}

describe("uploads that reach the server more than once", () => {
  it("a resent draft, and one sent twice at once, end as one upload", async () => {
    const draft = [
      site("device-phone", "site-reef"),
      dive("device-phone", "dive-a"),
    ]
    const clean = testApp()
    expect(await upload(clean, draft)).toBe("applied")

    const messy = testApp()
    // Two tabs send it at once on a fresh server: one applies it.
    const both = await Promise.all([upload(messy, draft), upload(messy, draft)])
    expect(both.sort()).toEqual(["alreadyApplied", "applied"])
    // A reply was lost, so the phone sends it again.
    expect(await upload(messy, draft)).toBe("alreadyApplied")

    expect(await finalLog(messy)).toEqual(await finalLog(clean))
    expect((await finalLog(messy)).dives).toHaveLength(1)
  })

  it("a draft edited after a lost reply ends as one upload of the edit", async () => {
    const fields = {
      maxDepth: 21.2,
      // Emptied on the phone, so the first upload's notes must go.
      notes: "",
      buddies: ["person-sam"],
    }
    const edited = () => [
      site("device-phone", "site-reef"),
      person("device-phone", "person-sam"),
      dive("device-phone", "dive-a", fields),
    ]
    const clean = testApp()
    await upload(clean, edited())

    const messy = testApp()
    await upload(messy, [
      site("device-phone", "site-reef"),
      dive("device-phone", "dive-a", { notes: "Logged on the boat" }),
    ])
    // The phone never heard back, and the draft was edited offline, so its
    // ops are new.
    expect(await upload(messy, edited())).toBe("applied")

    const log = await finalLog(messy)
    expect(log).toEqual(await finalLog(clean))
    expect(log.dives[0]).toMatchObject({ maxDepth: 21.2, notes: null })
    expect(log.links).toEqual([
      expect.objectContaining({ diveId: "dive-a", target: "person-sam" }),
    ])
  })
})

describe("a draft pointing at entities merged on the server", () => {
  async function withTwoOfEach() {
    const app = testApp()
    for (const [kind, id, name] of [
      ["site", "site-old", "Two-mile"],
      ["site", "site-reef", "Two Mile Reef"],
      ["person", "person-old", "Sam N"],
      ["person", "person-sam", "Sam Naidoo"],
    ] as const) {
      const fields = kind === "site" ? { name, countryCode: "ZA" } : { name }
      expect(
        (await send(app, "PUT", `/api/entities/${kind}/${id}`, fields)).status
      ).toBe(200)
    }
    return app
  }

  it("lands on the survivors, as one naming them does", async () => {
    const clean = await withTwoOfEach()
    const messy = await withTwoOfEach()
    for (const app of [clean, messy]) {
      for (const [kind, from, into] of [
        ["site", "site-old", "site-reef"],
        ["person", "person-old", "person-sam"],
      ])
        expect(
          (
            await send(app, "POST", `/api/entities/${kind}/${from}/merge`, {
              into,
            })
          ).status
        ).toBe(200)
    }

    await upload(clean, [
      dive("device-phone", "dive-a", {
        siteId: "site-reef",
        buddies: ["person-sam"],
      }),
    ])
    // Logged offline from the phone's copy, from before the merges.
    await upload(messy, [
      dive("device-phone", "dive-a", {
        siteId: "site-old",
        buddies: ["person-old"],
      }),
    ])

    const log = await finalLog(messy)
    expect(log).toEqual(await finalLog(clean))
    expect(log.dives[0]!.siteId).toBe("site-reef")
  })
})

describe("two phones creating the same site and buddy offline", () => {
  it("end with one of each, as one phone logging both dives does", async () => {
    const clean = testApp()
    await upload(clean, [
      site("device-phone", "site-reef"),
      person("device-phone", "person-sam"),
      dive("device-phone", "dive-a", { buddies: ["person-sam"] }),
    ])
    await upload(clean, [
      dive("device-phone", "dive-b", {
        startTime: "2026-11-08T13:00:00",
        buddies: ["person-sam"],
      }),
    ])

    const messy = testApp()
    await upload(messy, [
      site("device-phone", "site-reef"),
      person("device-phone", "person-sam"),
      dive("device-phone", "dive-a", { buddies: ["person-sam"] }),
    ])
    // The laptop made its own, under its own ids, and uploads second.
    await upload(messy, [
      site("device-laptop", "site-laptop"),
      person("device-laptop", "person-laptop"),
      dive("device-laptop", "dive-b", {
        startTime: "2026-11-08T13:00:00",
        siteId: "site-laptop",
        buddies: ["person-laptop"],
      }),
    ])

    const log = await finalLog(messy)
    expect(log).toEqual(await finalLog(clean))
    expect(log.sites).toHaveLength(1)
    expect(log.people).toHaveLength(1)
    expect(log.dives.map((d) => [d.id, d.number])).toEqual([
      ["dive-a", 1],
      ["dive-b", 2],
    ])
  })
})
