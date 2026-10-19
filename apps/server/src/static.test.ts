import { describe, expect, it } from "vitest"

import { testApp } from "../test/app.ts"

const app = testApp({ env: { SHYLOG_APP_NAME: "Dad's <log>" } })

describe("the web app", () => {
  it("is served with the instance's name as the title", async () => {
    const res = await app.request("/")
    expect(res.headers.get("Cache-Control")).toBe("no-cache")
    expect(await res.text()).toContain("<title>Dad's &lt;log&gt;</title>")
  })

  it("keeps a $ in the name as written", async () => {
    const named = testApp({ env: { SHYLOG_APP_NAME: "Log $' $&" } })
    expect(await (await named.request("/")).text()).toContain(
      "<title>Log $' $&amp;</title>"
    )
  })

  it("serves client-side routes the app, but not missing files or API paths", async () => {
    expect(await (await app.request("/dive/dive-a")).text()).toContain(
      "<title>"
    )
    expect((await app.request("/missing.js")).status).toBe(404)
    expect((await app.request("/api/missing")).status).toBe(403)
  })

  it("caches hashed assets for good and the service worker never", async () => {
    const asset = await app.request("/assets/index-abc123.js")
    expect(asset.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable"
    )
    expect((await app.request("/sw.js")).headers.get("Cache-Control")).toBe(
      "no-cache"
    )
  })

  it("has a manifest named after the instance", async () => {
    const res = await app.request("/manifest.webmanifest")
    expect(res.headers.get("Content-Type")).toBe("application/manifest+json")
    expect(await res.json()).toMatchObject({
      name: "Dad's <log>",
      short_name: "Dad's <log>",
      display: "standalone",
    })
  })
})
