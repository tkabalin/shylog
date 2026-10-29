import { expect, test, type Locator } from "@playwright/test"

const tabs = ["Log", "Stats", "Import", "You"]

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
    for (const tab of ["Stats", "You", "Log"]) {
      await nav.getByRole("link", { name: tab }).click()
      await expect(
        page.getByRole("heading", { name: tab, exact: true })
      ).toBeAttached()
    }
    await page.goBack()
    expect(page.url()).not.toMatch(/\/(stats|you)$/)
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

  test("opens a sheet as a dialog over the content", async ({ page }) => {
    await page.goto("/dive/new")
    await page.getByRole("button", { name: /^Surface interval/ }).click()
    const dialog = page.getByRole("dialog", { name: "Surface interval" })
    await expect(dialog).toBeVisible()
    await expect(page.locator("[data-slot=drawer-swipe-handle]")).toHaveCount(0)
    // Centred beside the sidebar, over the form.
    const box = (await dialog.boundingBox())!
    const main = (await page.locator("#main").boundingBox())!
    expect(box.x + box.width / 2).toBeCloseTo(main.x + main.width / 2, 0)

    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
  })

  test("picks a choice from a select below its row", async ({ page }) => {
    await page.goto("/dive/new")
    const type = page.getByRole("combobox", { name: /^Type,/ })
    await type.click()
    const list = page.getByRole("listbox")
    await expect(list).toBeVisible()
    await list.getByRole("option", { name: "Training" }).click()
    await expect(list).toBeHidden()
    await expect(type).toHaveAccessibleName("Type, Training")
    // No sheet opened for it.
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })

  test("moves between the Log, a dive and its form by header buttons", async ({
    page,
  }) => {
    await page.goto("/")
    const card = page.locator("#main a[href^='/dive/dive-']").first()
    const dive = (await card.getAttribute("href"))!
    await card.click()
    await expect(page).toHaveURL(dive)
    // Once the dive has loaded, so the router knows the Log is behind it.
    await expect(page.getByRole("link", { name: "Edit" })).toBeVisible()

    // Pushed from the Log, so the breadcrumb pops back to it.
    await page.getByRole("link", { name: "Log", exact: true }).last().click()
    await expect(page).toHaveURL("/")
    await page.goForward()
    await expect(page).toHaveURL(dive)

    await page.getByRole("link", { name: "Edit" }).click()
    await expect(page).toHaveURL(`${dive}/edit`)
    await page.goBack()
    await expect(page).toHaveURL(dive)

    await page.goto("/")
    await page.getByRole("link", { name: "New dive" }).click()
    await expect(page).toHaveURL("/dive/new")
    await page.goBack()
    await expect(page).toHaveURL("/")
  })

  test("asks before the sidebar leaves a form with something typed", async ({
    page,
  }) => {
    await page.goto("/dive/new")
    await page.getByRole("textbox", { name: "Weight" }).fill("6")
    const log = page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Log" })
    const ask = page.getByRole("dialog", { name: "Discard changes?" })

    await log.click()
    await expect(ask).toBeVisible()
    await ask.getByRole("button", { name: "Keep editing" }).click()
    await expect(ask).toBeHidden()
    await expect(page).toHaveURL("/dive/new")

    await log.click()
    await ask.getByRole("button", { name: "Discard changes" }).click()
    await expect(page).toHaveURL("/")
  })

  test("types the surface interval in boxes", async ({ page }) => {
    await page.goto("/dive/new")
    const row = page.getByRole("button", { name: /^Surface interval/ })
    await row.click()
    await page.getByRole("textbox", { name: "Hours" }).fill("1")
    await page.getByRole("textbox", { name: "Minutes" }).fill("45")
    await page.getByRole("button", { name: "Done" }).click()
    await expect(row).toHaveAccessibleName("Surface interval, 1 h 45 min")

    // Past the 48 h cap the box shows what's saved; Enter is Done.
    await row.click()
    await page.getByRole("textbox", { name: "Hours" }).fill("48")
    const minutes = page.getByRole("textbox", { name: "Minutes" })
    await minutes.fill("30")
    await expect(minutes).toHaveValue("0")
    await minutes.press("Enter")
    await expect(row).toHaveAccessibleName("Surface interval, 48 h 0 min")
  })

  test("picks the date and time from popovers", async ({ page }) => {
    await page.goto("/dive/new")
    const date = page.getByRole("button", { name: /^Date,/ })
    await date.click()
    await page.getByRole("button", { name: /, 15 \w+ \d{4}/ }).click()
    await expect(date).toHaveAccessibleName(/^Date, \w{3} 15 /)
    // It opens on the picked day, so the arrows move from there.
    await date.click()
    await page.keyboard.press("ArrowLeft")
    await page.keyboard.press("Enter")
    await expect(date).toHaveAccessibleName(/^Date, \w{3} 14 /)

    // An empty time opens at 09:00, and each column sets it at once.
    const time = page.getByRole("button", { name: /^Start time,/ })
    await time.click()
    await expect(time).toHaveAccessibleName("Start time, 09:00")
    const minutes = page.getByRole("listbox", { name: "Minutes" })
    await minutes.focus()
    await page.keyboard.press("ArrowDown")
    await page
      .getByRole("listbox", { name: "Hours" })
      .getByRole("option", { name: "14" })
      .click()
    await page.keyboard.press("Escape")
    await expect(time).toHaveAccessibleName("Start time, 14:01")
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

// Wider than 48rem but under a finger, so it keeps the phone's chrome.
test.describe("on a phone turned landscape", () => {
  // WebKit can't emulate a coarse pointer.
  test.skip(({ browserName }) => browserName !== "chromium")
  test.use({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  })

  test("keeps the bottom nav and touch sizes", async ({ page }) => {
    await page.goto("/dev/ui")
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible()
    await expect(page.locator("[data-slot=sidebar]")).toBeHidden()
    expect(
      await height(page.getByRole("button", { name: "Save" }))
    ).toBeGreaterThanOrEqual(44)
    await expect(page.getByRole("textbox", { name: "Site" })).toHaveCSS(
      "font-size",
      "16px"
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
