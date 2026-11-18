import { afterEach, describe, expect, it, vi } from "vitest"

import { keyRefused } from "./imagery"

const url = "https://ibasemaps-api.arcgis.com/tile/13/4924/4515?token=k"
const answer = (body: BodyInit, init: ResponseInit = {}) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(body, init)))
  )
// As Esri sends them: a 200 with the error as JSON.
const esri = (code: number) =>
  answer(JSON.stringify({ error: { code, message: "", details: [] } }), {
    headers: { "Content-Type": "text/plain" },
  })

afterEach(() => vi.unstubAllGlobals())

describe("keyRefused", () => {
  it("reads Esri's invalid and missing key errors", async () => {
    esri(498)
    expect(await keyRefused(url)).toBe(true)
    esri(499)
    expect(await keyRefused(url)).toBe(true)
  })

  it("reads a refusal sent as the status", async () => {
    answer("Forbidden", { status: 403 })
    expect(await keyRefused(url)).toBe(true)
  })

  it("isn't a refusal when a tile or another error comes", async () => {
    answer(new Uint8Array([0xff, 0xd8]), {
      headers: { "Content-Type": "image/jpeg" },
    })
    expect(await keyRefused(url)).toBe(false)
    esri(500)
    expect(await keyRefused(url)).toBe(false)
  })

  it("isn't a refusal when nothing answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    )
    expect(await keyRefused(url)).toBe(false)
  })
})
