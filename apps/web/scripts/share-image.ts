// Renders the picture a shared link to the public dive site map shows, from
// the site itself in a desktop browser. Run `pnpm --filter @shylog/web
// share-image` after a change to how the map opens, and commit the result.
import { fileURLToPath } from "node:url"

import { chromium } from "@playwright/test"
import sharp from "sharp"
import { createServer } from "vite"

// The size Open Graph previews are cut to, in WhatsApp, iMessage and Slack.
const width = 1200
const height = 630
const out = fileURLToPath(
  new URL("../src/divesites/share.png", import.meta.url)
)

const server = await createServer({
  configFile: fileURLToPath(
    new URL("../vite.divesites.config.ts", import.meta.url)
  ),
  server: { port: 0 },
  logLevel: "warn",
})
await server.listen()
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width, height },
    colorScheme: "light",
  })
  await page.goto(server.resolvedUrls!.local[0]!)
  // Shown once the land has drawn, and still once the camera has settled.
  // A string, as this file's types have no DOM.
  await page.waitForFunction(
    `(() => {
      const map = document.querySelector("main div:has(> .maplibregl-map)")
      return map && getComputedStyle(map).opacity === "1" &&
        map.getAttribute("aria-busy") !== "true"
    })()`,
    undefined,
    { timeout: 30_000 }
  )
  await page.waitForLoadState("networkidle")
  // The card names the site; the map's buttons and credit are clutter here.
  await page.addStyleTag({
    content: `.maplibregl-ctrl-attrib, [aria-label="Zoom"], [aria-label="Map options"] { display: none !important }`,
  })
  await page.waitForTimeout(500)
  const shot = await page.screenshot()
  // A palette PNG, as a map in flat colours keeps well in one, and WhatsApp
  // drops a preview much over 300 KB.
  await sharp(shot).png({ palette: true, quality: 90 }).toFile(out)
} finally {
  await browser.close()
  await server.close()
}
