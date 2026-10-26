// Renders public/icon.svg to the PNG iOS puts on the Home Screen, since iOS
// ignores SVG icons. Run `pnpm --filter @shylog/web icons` after changing the
// icon and commit the result.
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { chromium } from "@playwright/test"

// iOS asks for 180 px but draws large Home Screen icons bigger, and the
// upscaled PNG looked soft on a phone. It only ever scales 1024 px down.
const size = 1024
const publicDir = new URL("../public/", import.meta.url)

const svg = await readFile(new URL("icon.svg", publicDir))
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
  })
  // An <img>, so the shadow filter renders as it does in a browser tab.
  await page.setContent(
    `<body style="margin:0"><img src="data:image/svg+xml;base64,${svg.toString("base64")}" width="${size}" height="${size}" style="display:block"></body>`
  )
  await page.screenshot({
    path: fileURLToPath(new URL("apple-touch-icon.png", publicDir)),
  })
} finally {
  await browser.close()
}
