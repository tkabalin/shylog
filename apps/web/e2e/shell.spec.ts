import { expect, test, type Locator } from "@playwright/test"

const tabs = ["Log", "Stats", "Import", "Settings"]

async function height(locator: Locator) {
  const box = await locator.boundingBox()
  return box?.height ?? 0
}

test.describe("at phone width", () => {
  test("shows the four tabs in a bottom nav and no sidebar", async ({
    page,
  }) => {
    await page.goto("/")
    const nav = page.getByRole("navigation", { name: "Main" })
    await expect(nav).toHaveCount(1)
    // Icons only: each tab is named by its aria-label, with no visible text.
    await expect(nav.getByRole("link")).toHaveCount(tabs.length)
    for (const tab of tabs) {
      await expect(nav.getByRole("link", { name: tab })).toBeVisible()
    }
    await expect(nav).toHaveText("")
    expect(await height(nav.getByRole("link").first())).toBeGreaterThanOrEqual(
      44
    )
    await expect(page.locator("[data-slot=sidebar]")).toBeHidden()

    const box = await nav.boundingBox()
    expect(box!.y + box!.height).toBeCloseTo(844, 0)

    await nav.getByRole("link", { name: "Stats" }).click()
    await expect(page).toHaveURL("/stats")
    await expect(nav.getByRole("link", { name: "Stats" })).toHaveAttribute(
      "aria-current",
      "page"
    )
    await expect(nav.getByRole("link", { name: "Log" })).not.toHaveAttribute(
      "aria-current",
      "page"
    )
  })

  // Find what is too wide instead of hiding it behind overflow-x: clip.
  test("does not scroll sideways", async ({ page }) => {
    await page.goto("/")
    const main = page.locator("main")
    const overflow = await main.evaluate(
      (el) => el.scrollWidth - el.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test("scrolls the content, not the page, and resets it on navigation", async ({
    page,
  }) => {
    await page.goto("/")
    const main = page.locator("main")
    await main.evaluate((el) => {
      el.append(
        Object.assign(document.createElement("div"), {
          style: "height: 3000px; flex: none",
        })
      )
      el.scrollTop = 500
    })
    expect(await main.evaluate((el) => el.scrollTop)).toBe(500)
    expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(
      0
    )

    const nav = page.getByRole("navigation", { name: "Main" })
    const box = await nav.boundingBox()
    expect(box!.y + box!.height).toBeCloseTo(844, 0)

    await nav.getByRole("link", { name: "Stats" }).click()
    await expect(page).toHaveURL("/stats")
    await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBe(0)
  })

  test("shows the bottom nav's top line only while content is under it", async ({
    page,
  }) => {
    // Stats is still empty, so the page starts too short to scroll.
    await page.goto("/stats")
    const nav = page.getByRole("navigation", { name: "Main" })
    const main = page.locator("main")
    const line = () => nav.evaluate((el) => getComputedStyle(el).borderTopColor)
    // Any colour space, so long as the alpha is zero
    const none = /[/,] 0\)$/

    // Too short to scroll
    await expect.poll(line).toMatch(none)

    await main.evaluate((el) => {
      el.append(
        Object.assign(document.createElement("div"), {
          style: "height: 3000px; flex: none",
        })
      )
    })
    await expect.poll(line).not.toMatch(none)

    await main.evaluate((el) => (el.scrollTop = el.scrollHeight))
    await expect.poll(line).toMatch(none)
  })

  test("switches tabs in place, so back never steps through them", async ({
    page,
  }) => {
    await page.goto("/")
    const nav = page.getByRole("navigation", { name: "Main" })
    for (const tab of ["Stats", "Settings", "Log"]) {
      await nav.getByRole("link", { name: tab }).click()
      await expect(page.getByRole("heading", { name: tab })).toBeAttached()
    }
    await page.goBack()
    expect(page.url()).not.toMatch(/\/(stats|settings)$/)
  })

  test("sizes controls for touch and inputs at 16px", async ({ page }) => {
    await page.goto("/dev/ui")
    const controls = [
      page.getByRole("button", { name: "Save" }),
      page.getByRole("textbox", { name: "Site" }),
      page.getByRole("combobox", { name: "Water" }),
      page.getByRole("link", { name: "Partridge Point" }),
    ]
    for (const control of controls) {
      expect(await height(control)).toBeGreaterThanOrEqual(44)
    }
    await expect(page.getByRole("textbox", { name: "Site" })).toHaveCSS(
      "font-size",
      "16px"
    )
  })
})

test.describe("at desktop width", () => {
  test.use({ viewport: { width: 1024, height: 768 } })

  test("shows the tabs in a sidebar and no bottom nav", async ({ page }) => {
    await page.goto("/")
    const nav = page.getByRole("navigation", { name: "Main" })
    await expect(nav).toHaveCount(1)
    await expect(nav.getByRole("link")).toHaveText(tabs)
    await expect(page.locator("[data-slot=sidebar]")).toBeVisible()

    await nav.getByRole("link", { name: "Import" }).click()
    await expect(page).toHaveURL("/import")
    const current = nav.locator("[data-active]")
    await expect(current).toHaveText("Import")
    await expect(current).toHaveAttribute("aria-current", "page")
  })

  test("returns controls to compact sizes", async ({ page }) => {
    await page.goto("/dev/ui")
    expect(await height(page.getByRole("button", { name: "Save" }))).toBe(32)
    await expect(page.getByRole("textbox", { name: "Site" })).toHaveCSS(
      "font-size",
      "14px"
    )
  })
})

test("follows the system dark setting", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" })
  await page.goto("/")
  await expect(page.locator("html")).not.toHaveClass(/dark/)
  const light = await page
    .locator("body")
    .evaluate((body) => getComputedStyle(body).backgroundColor)

  const themeColor = page.locator('meta[name="theme-color"]')
  await expect(themeColor).toHaveAttribute("content", light)

  await page.emulateMedia({ colorScheme: "dark" })
  await expect(page.locator("html")).toHaveClass(/dark/)
  const dark = await page
    .locator("body")
    .evaluate((body) => getComputedStyle(body).backgroundColor)
  expect(dark).not.toBe(light)
  await expect(themeColor).toHaveAttribute("content", dark)
})

// Evidence for review, not baselines: the folder is gitignored.
test.describe("screenshots", () => {
  test.skip(({ browserName }) => browserName !== "chromium")

  for (const width of [390, 1024]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${width} ${colorScheme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 768 })
        await page.emulateMedia({ colorScheme })
        await page.goto("/")
        await expect(
          page.getByRole("navigation", { name: "Main" })
        ).toBeVisible()
        await page.screenshot({
          // Beside this file, whichever directory Playwright runs from
          path: `${import.meta.dirname}/__screenshots__/shell-${width}-${colorScheme}.png`,
        })
      })
    }
  }
})
