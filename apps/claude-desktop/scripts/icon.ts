// Renders the web app's favicon, the shark on a transparent background, to the
// PNG Desktop shows for the extension, as a manifest icon can't be an SVG. Run
// `pnpm --filter @shylog/claude-desktop icon` after changing it and commit it.
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { chromium } from "@playwright/test"

const size = 512

const svg = await readFile(
  new URL("../../web/public/favicon.svg", import.meta.url)
)
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
  })
  await page.setContent(
    `<body style="margin:0"><img src="data:image/svg+xml;base64,${svg.toString("base64")}" width="${size}" height="${size}" style="display:block"></body>`
  )
  await page.screenshot({
    path: fileURLToPath(new URL("../icon.png", import.meta.url)),
    omitBackground: true,
  })
} finally {
  await browser.close()
}
