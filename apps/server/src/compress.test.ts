import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gunzipSync } from "node:zlib"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { apiHeaders, origin, testApp } from "../test/app.ts"
import { diveId, seededDb } from "../test/fixture.ts"
import { hashOf } from "./cards/store.ts"
import type { Db } from "./db/open.ts"

const gzip = { ...apiHeaders, "Accept-Encoding": "gzip, deflate, br" }

let dir: string
let db: Db
let app: ReturnType<typeof testApp>
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "shylog-compress-"))
  db = seededDb()
  app = testApp({ db, env: { SHYLOG_DATA_DIR: dir } })
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const get = (path: string, headers: Record<string, string> = gzip) =>
  app.request(path, { headers })

describe("compression", () => {
  it("gzips the log, keeping its ETag and 304", async () => {
    const plain = await get("/api/log", apiHeaders)
    expect(plain.headers.get("Content-Encoding")).toBeNull()
    expect(plain.headers.get("Vary")).toBe("Accept-Encoding")
    const json = await plain.text()

    const res = await get("/api/log")
    expect(res.headers.get("Content-Encoding")).toBe("gzip")
    expect(res.headers.get("Vary")).toBe("Accept-Encoding")
    const body = Buffer.from(await res.arrayBuffer())
    // The same log, a moment later.
    const unzipped = JSON.parse(gunzipSync(body).toString()) as object
    expect({ ...unzipped, serverTime: null }).toEqual({
      ...(JSON.parse(json) as object),
      serverTime: null,
    })
    expect(body.length).toBeLessThan(json.length / 4)

    // Weak, as the bytes differ from the plain response's.
    const { version } = JSON.parse(json) as { version: string }
    expect(res.headers.get("ETag")).toBe(`W/"${version}"`)
    const again = await get("/api/log", {
      ...gzip,
      "If-None-Match": res.headers.get("ETag")!,
    })
    expect(again.status).toBe(304)
  })

  it("gzips a dive's samples", async () => {
    const res = await get(`/api/dives/${diveId(db, 63)}/samples`)
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Encoding")).toBe("gzip")
    const { samples } = JSON.parse(
      gunzipSync(Buffer.from(await res.arrayBuffer())).toString()
    ) as { samples: unknown[] }
    expect(samples.length).toBeGreaterThan(100)
  })

  it("leaves bodies under 1 KB alone", async () => {
    const res = await get("/api/version")
    expect(res.headers.get("Content-Encoding")).toBeNull()
    expect(Number(res.headers.get("Content-Length"))).toBeLessThan(1024)
    expect(await res.json()).toHaveProperty("version")
  })

  it("leaves card images alone", async () => {
    // A PNG signature padded past the threshold.
    const png = new Uint8Array(4096)
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const form = new FormData()
    form.append("name", "PADI Open Water")
    form.append("images", new Blob([png]), "card.png")
    const put = await app.request("/api/cards/card-padi", {
      method: "PUT",
      headers: { ...apiHeaders, Origin: origin },
      body: form,
    })
    expect(put.status).toBe(200)

    const res = await get(`/api/cards/card-padi/images/0?v=${hashOf(png)}`)
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/png")
    expect(res.headers.get("Content-Encoding")).toBeNull()
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(png)
  })
})
