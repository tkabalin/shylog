import { expect, type Locator, type Page } from "@playwright/test"

import { test } from "./api"

// A fresh phone draws each screen before its first sync has brought the
// log. Anything that arrives with the log must land below what is already
// drawn, or a finger already on a row taps whatever moved under it.

// Where each element sits in #main's content, keyed by what survives the
// log arriving: ids, link targets and heading text. Skeletons and sr-only
// text have no place a finger could be on.
const places = (page: Page) =>
  page.evaluate(() => {
    const main = document.getElementById("main")!
    const found = new Map<string, number | null>()
    for (const el of main.querySelectorAll("[id], a[href], h1, h2, h3")) {
      const box = el.getBoundingClientRect()
      if (box.width <= 1 || box.height <= 1) continue
      const key = el.id
        ? `#${el.id}`
        : (el.getAttribute("href") ?? `${el.tagName} ${el.textContent}`)
      // A key found twice can't be followed, so neither copy counts.
      found.set(
        key,
        found.has(key) ? null : Math.round(box.top + main.scrollTop)
      )
    }
    return Object.fromEntries([...found].filter(([, y]) => y != null))
  })

// Each screen with more than a skeleton before the log (the Log and
// Statistics swap theirs whole), and something only the log draws. You's
// sync status says All synced a render before the log is drawn.
const screens: [string, (page: Page) => Locator][] = [
  ["/stats/patterns", (page) => page.getByText("All time", { exact: true })],
  [
    "/you",
    (page) =>
      page.locator("main a[href='/you/entities?kind=site']", { hasText: "2" }),
  ],
  [
    "/you/entities?kind=site",
    (page) => page.locator("main a[href^='/you/entities/site/']").first(),
  ],
  ["/you/certifications", (page) => page.getByText("No cards yet")],
  ["/you/deleted", (page) => page.getByText("Nothing deleted")],
]

for (const [width, height] of [
  [390, 844],
  [1280, 800],
])
  test.describe(`${width} px wide`, () => {
    test.use({ viewport: { width, height } })

    for (const [url, synced] of screens)
      test(`keeps ${url} in place when the first sync arrives`, async ({
        page,
      }) => {
        let release!: () => void
        const held = new Promise<void>((resolve) => (release = resolve))
        await page.route("**/api/log", async (route) => {
          await held
          await route.continue()
        })
        await page.goto(url)
        await expect(page.locator("#main h1").first()).toBeAttached()
        // Geist arriving late moves wrapped text for reasons of its own.
        await page.evaluate(() => document.fonts.ready)
        const before = await places(page)
        expect(Object.keys(before)).not.toEqual([])
        release()
        await expect(synced(page)).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const after = await places(page)
        const moved = Object.entries(before)
          .filter(([key, y]) => key in after && after[key] !== y)
          .map(([key, y]) => `${key}: ${y} → ${after[key]}`)
        expect(moved).toEqual([])
        // A later sync may still be asking as the test ends.
        await page.unrouteAll({ behavior: "ignoreErrors" })
      })
  })
