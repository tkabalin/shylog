import { describe, expect, it } from "vitest"

import { apiHeaders, send, testApp } from "../../test/app.ts"
import type { Log } from "../../src/routes/log.ts"
import { convertSsi, type Extras } from "./convert.ts"
import { boat, csv, extras, shore } from "./fixture.ts"
import { preflight } from "./preflight.ts"

// Stamped now: the server refuses drafts more than two years old.
const drafts = (extra: Extras = extras) =>
  convertSsi(csv([shore, boat]), extra, new Date().toISOString()).drafts

async function setup() {
  const app = testApp()
  const log = async () =>
    (await (
      await app.request("/api/log", { headers: apiHeaders })
    ).json()) as Log
  const upload = async (list = drafts()) => {
    for (const draft of list) await send(app, "POST", "/api/ops", draft)
  }
  return { app, log, upload }
}

// A dive typed in by hand at Kelp Point, the shore dive's site.
const handDive = (diveId: string, startTime: string) => ({
  ops: [
    {
      opId: `op-${diveId}`,
      opVersion: 1,
      deviceId: "device-phone",
      at: new Date().toISOString(),
      type: "upsertDive",
      diveId,
      fields: { startTime, siteId: "site-ssi-11", duration: 1800, maxDepth: 6 },
    },
  ],
})

describe("preflight", () => {
  it("sends every dive to an empty log", async () => {
    const { log } = await setup()
    const plan = preflight(drafts(), await log())
    expect(plan.send).toHaveLength(2)
    expect([plan.uploaded, plan.clashes, plan.deleted]).toEqual([[], [], []])
  })

  it("sends nothing again, and names what the extras now change", async () => {
    const { log, upload } = await setup()
    await upload()
    expect(preflight(drafts(), await log()).uploaded).toEqual([
      expect.objectContaining({ diveId: "dive-ssi-101", differences: [] }),
      expect.objectContaining({ diveId: "dive-ssi-102", differences: [] }),
    ])

    const changed = preflight(
      drafts({
        ...extras,
        leaveOutPeople: [],
        dives: {
          ...extras.dives,
          "2025-11-10 10:00": { entry: "charterBoat", tags: ["wreck"] },
        },
      }),
      await log()
    )
    expect(changed.send).toEqual([])
    expect(changed.uploaded[1]).toMatchObject({
      diveId: "dive-ssi-102",
      differences: ["entry", "buddies", "tags"],
    })
  })

  it("stops for a dive at the same time, not one later that day", async () => {
    const { app, log, upload } = await setup()
    await upload([drafts()[0]!])
    // The boat dive runs 10:00 to 10:46.
    await send(
      app,
      "POST",
      "/api/ops",
      handDive("dive-same", "2025-11-10T10:30:00")
    )
    await send(
      app,
      "POST",
      "/api/ops",
      handDive("dive-later", "2025-11-10T14:00:00")
    )
    const plan = preflight(drafts(), await log())
    expect(plan.clashes).toEqual([
      {
        ssi: { diveId: "dive-ssi-102", startTime: "2025-11-10T10:00:00" },
        logged: { diveId: "dive-same", startTime: "2025-11-10T10:30:00" },
      },
    ])
  })

  it("warns of a clash in Recently deleted, and won't resend a deleted SSI dive", async () => {
    const { app, log, upload } = await setup()
    await upload()
    await send(
      app,
      "POST",
      "/api/ops",
      handDive("dive-same", "2025-11-10T10:30:00")
    )
    await send(app, "DELETE", "/api/dives/dive-same")
    await send(app, "DELETE", "/api/dives/dive-ssi-101")
    const plan = preflight(drafts(), await log())
    expect(plan.clashes).toEqual([])
    expect(plan.deletedClashes.map(({ logged }) => logged.diveId)).toEqual([
      "dive-same",
    ])
    expect(plan.deleted.map(({ diveId }) => diveId)).toEqual(["dive-ssi-101"])
  })
})
