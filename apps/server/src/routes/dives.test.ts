import { beforeEach, describe, expect, it } from "vitest"

import { apiHeaders, origin, send, testApp } from "../../test/app.ts"
import { diveId, seededDb } from "../../test/fixture.ts"
import type { Db } from "../db/open.ts"
import type { Log } from "./log.ts"

let db: Db
let app: ReturnType<typeof testApp>
let id: string
beforeEach(() => {
  db = seededDb()
  app = testApp({ db })
  // EANx32 to 32.66 m, all its imported values from the computer.
  id = diveId(db, 63)
})

const patch = (body: unknown, dive = id) =>
  send(app, "PATCH", `/api/dives/${dive}`, body)

const getLog = async () =>
  (await (await app.request("/api/log", { headers: apiHeaders })).json()) as Log

const theDive = async () => (await getLog()).dives.find((d) => d.id === id)!

const meta = (field: string) =>
  db
    .prepare(
      "SELECT source, computer_value AS computerValue, dismissed FROM field_meta WHERE dive_id = ? AND field = ?"
    )
    .get(id, field)

const journal = () =>
  db.prepare("SELECT type, payload FROM ops ORDER BY seq").all() as {
    type: string
    payload: string
  }[]

describe("PATCH /api/dives/:id", () => {
  it("updates only the fields sent, replies with the new version and journals", async () => {
    const log = await getLog()
    const before = log.dives.find((d) => d.id === id)!
    const res = await patch({
      fields: { notes: "Potato bass at the pinnacle" },
    })
    expect(res.status).toBe(200)
    const { version } = (await res.json()) as { version: string }
    expect(version).not.toBe(log.version)

    const after = await theDive()
    expect(after).toEqual({ ...before, notes: "Potato bass at the pinnacle" })
    expect(journal().at(-1)).toEqual({
      type: "editDive",
      payload: JSON.stringify({
        diveId: id,
        fields: { notes: "Potato bass at the pinnacle" },
      }),
    })
    const current = (await (
      await app.request("/api/version", { headers: apiHeaders })
    ).json()) as { version: string }
    expect(current.version).toBe(version)
  })

  it("writes nothing for a repeated edit", async () => {
    const body = { fields: { notes: "Potato bass" } }
    const first = (await (await patch(body)).json()) as { version: string }
    const entries = journal().length
    const again = (await (await patch(body)).json()) as { version: string }
    expect(again.version).toBe(first.version)
    expect(journal()).toHaveLength(entries)
  })

  it("keeps the computer's value when a computer-filled field is edited by hand", async () => {
    await patch({ fields: { maxDepth: 33 } })
    expect((await theDive()).maxDepth).toBe(33)
    expect(meta("maxDepth")).toEqual({
      source: "hand",
      computerValue: 32.66,
      dismissed: 0,
    })
    // Typing the computer's value back keeps it, as does another edit.
    await patch({ fields: { maxDepth: 32.66 } })
    expect(meta("maxDepth")).toMatchObject({ computerValue: 32.66 })
  })

  it("dismisses and adopts a computer value", async () => {
    await patch({ fields: { maxDepth: 33 } })
    await patch({ dismiss: ["maxDepth"] })
    expect(meta("maxDepth")).toEqual({
      source: "hand",
      computerValue: 32.66,
      dismissed: 1,
    })
    // A later hand edit keeps the dismissal, as the value is still yours.
    await patch({ fields: { maxDepth: 33.5 } })
    expect(meta("maxDepth")).toMatchObject({ dismissed: 1 })

    await patch({ adopt: ["maxDepth"] })
    expect((await theDive()).maxDepth).toBe(32.66)
    expect(meta("maxDepth")).toEqual({
      source: "computer",
      computerValue: null,
      dismissed: 0,
    })
  })

  it("refuses to adopt or dismiss without a computer value", async () => {
    db.prepare(
      "DELETE FROM field_meta WHERE dive_id = ? AND field = 'maxDepth'"
    ).run(id)
    await patch({ fields: { maxDepth: 33 } })
    expect((await patch({ adopt: ["maxDepth"] })).status).toBe(422)
    expect((await patch({ dismiss: ["maxDepth"] })).status).toBe(422)
  })

  it("writes nothing for a retried adoption", async () => {
    await patch({ fields: { maxDepth: 33 } })
    const first = (await (await patch({ adopt: ["maxDepth"] })).json()) as {
      version: string
    }
    const again = await patch({ adopt: ["maxDepth"] })
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual(first)
  })

  it("keeps a cleared computer value as an empty hand value", async () => {
    await patch({ fields: { averageDepth: null } })
    expect((await theDive()).averageDepth).toBeNull()
    expect(meta("averageDepth")).toMatchObject({
      source: "hand",
      computerValue: 21.005,
    })
  })

  it("forgets the source of a cleared hand value with nothing from the computer", async () => {
    await patch({ fields: { weight: 4 } })
    expect(meta("weight")).toMatchObject({ source: "hand" })
    await patch({ fields: { weight: null } })
    expect(meta("weight")).toBeUndefined()
    expect((await theDive()).weight).toBeNull()
  })

  it("clears oxygen when nitrox is turned off, and training details with the type", async () => {
    await patch({
      fields: {
        diveType: "training",
        trainingAgency: "PADI",
        trainingCourse: "Deep Specialty",
      },
    })
    expect(await theDive()).toMatchObject({ trainingAgency: "PADI" })
    await patch({ fields: { diveType: "recreation", nitrox: false } })
    expect(await theDive()).toMatchObject({
      diveType: "recreation",
      trainingAgency: null,
      trainingCourse: null,
      nitrox: false,
      oxygen: null,
    })
    // Oxygen came from the computer, so its value is kept for the diver.
    expect(meta("oxygen")).toMatchObject({ source: "hand", computerValue: 320 })
  })

  it("checks the rules that span fields against the stored dive", async () => {
    const air = diveId(db, 54)
    const nitrox = await patch({ fields: { nitrox: true } }, air)
    expect(nitrox.status).toBe(422)
    expect(await nitrox.json()).toEqual({
      error: "Give the oxygen percentage for nitrox",
      path: ["fields", "oxygen"],
    })
    expect((await patch({ fields: { oxygen: null } })).status).toBe(422)
    // The computer's lowest temperature on dive 63 is 21 °C or so.
    expect((await patch({ fields: { maxTemperature: 5 } })).status).toBe(422)
    expect((await patch({ fields: { maxDepth: 10 } })).status).toBe(422)
    await patch({ fields: { visibility: 12 } })
    expect((await patch({ fields: { visibilityRating: "high" } })).status).toBe(
      422
    )
  })

  it("is 400 for a body that isn't JSON", async () => {
    const res = await app.request(`/api/dives/${id}`, {
      method: "PATCH",
      headers: {
        ...apiHeaders,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: "{",
    })
    expect(res.status).toBe(400)
  })

  it("rejects an unknown site and a dive in Recently deleted", async () => {
    const site = await patch({ fields: { siteId: "site-nowhere" } })
    expect(await site.json()).toMatchObject({
      error: "The site isn't on the server",
    })
    expect(
      (await patch({ fields: { notes: "x" } }, "dive-nowhere")).status
    ).toBe(404)
    await send(app, "DELETE", `/api/dives/${id}`)
    expect((await patch({ fields: { notes: "x" } })).status).toBe(409)
  })
})

describe("DELETE /api/dives/:id and restore", () => {
  it("moves a dive to Recently deleted and back, each safe to repeat", async () => {
    const res = await send(app, "DELETE", `/api/dives/${id}`)
    expect(res.status).toBe(200)
    const { version } = (await res.json()) as { version: string }
    const deleted = await theDive()
    expect(deleted.deletedAt).not.toBeNull()
    expect(deleted.number).toBeNull()
    const live = (await getLog()).dives.filter((d) => d.deletedAt == null)
    expect(live).toHaveLength(45)
    expect(journal().at(-1)).toMatchObject({ type: "deleteDive" })

    const again = await send(app, "DELETE", `/api/dives/${id}`)
    expect(await again.json()).toEqual({ version })

    const restored = await send(app, "POST", `/api/dives/${id}/restore`)
    expect(restored.status).toBe(200)
    const { version: after } = (await restored.json()) as { version: string }
    expect(after).not.toBe(version)
    expect(await theDive()).toMatchObject({ deletedAt: null, number: 37 })
    const twice = await send(app, "POST", `/api/dives/${id}/restore`)
    expect(await twice.json()).toEqual({ version: after })
  })

  it("is 404 for an unknown dive", async () => {
    expect((await send(app, "DELETE", "/api/dives/dive-nowhere")).status).toBe(
      404
    )
  })
})
