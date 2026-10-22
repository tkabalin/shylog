import { expect, type Page } from "@playwright/test"

import { deleteDive, diveId, getLog, test, uploadDive } from "./api"

// A figure's value by its term, as screen readers pair them.
const figure = (page: Page, term: string) =>
  page
    .locator("dl > div")
    .filter({ has: page.locator("dt", { hasText: term }) })
    .locator("dd")

test("shows fixture dive 63's figures", async ({ page, request }) => {
  await page.goto(`/dive/${await diveId(request, 63)}`)

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sodwana")
  await expect(page.getByText("Dive 37")).toBeVisible()
  await expect(page.getByText("South Africa", { exact: true })).toBeVisible()
  await expect(page.getByText("Wed 22 Jul 2026")).toBeVisible()
  await expect(page.getByText("08:12")).toBeVisible()

  await expect(figure(page, "Max depth")).toHaveText("32.7m")
  await expect(figure(page, "Duration")).toHaveText("42min")
  await expect(figure(page, "Avg depth")).toHaveText("21.0m")
  await expect(figure(page, "Water temperature")).toHaveText(
    /^\d+(\.\d)?–\d+(\.\d)?°C$/
  )
  // No cylinder pressures in the export, so no SAC.
  await expect(figure(page, "SAC rate")).toHaveText("—")
  await expect(figure(page, "Gas").first()).toHaveText("EANx32")
  await expect(figure(page, "Max PO₂")).toHaveText("1.38bar")
  await expect(figure(page, "MOD at 1.4 bar")).toHaveText("33.2m")
  // Subsurface's own figures for the dive (packages/core/test/subsurface.ts).
  await expect(figure(page, "CNS at end")).toHaveText("15%")
  await expect(figure(page, "OTU")).toHaveText("41")
  await expect(page.getByText("Suunto D4i")).toBeVisible()
})

test("sends the Log link to a fresh Log when the dive was opened directly", async ({
  page,
  request,
}) => {
  // Something before it in history that isn't the Log.
  await page.goto("/stats")
  await page.goto(`/dive/${await diveId(request, 63)}`)
  await page
    .locator("header")
    .first()
    .getByRole("link", { name: "Log" })
    .click()
  await expect(page).toHaveURL("/")
  await expect(page.locator("main a[href^='/dive/']").first()).toBeVisible()
})

test("brings the site name into the bar once the title scrolls away", async ({
  page,
  request,
}) => {
  await page.goto(`/dive/${await diveId(request, 63)}`)
  const bar = page.locator("header").first()
  const barTitle = bar.getByText("Sodwana")
  await expect(barTitle).toHaveCSS("opacity", "0")
  // The h1 names the page; the bar's copy is only for the eye.
  await expect(barTitle).toHaveAttribute("aria-hidden", "true")
  await expect(bar).not.toHaveAttribute("data-scrolled")
  // Any scroll gives the bar its material; the title waits for the h1.
  await page.locator("#main").evaluate((el) => el.scrollBy(0, 10))
  await expect(bar).toHaveAttribute("data-scrolled", "")
  await expect(barTitle).toHaveCSS("opacity", "0")
  await page.locator("#main").evaluate((el) => el.scrollBy(0, 300))
  await expect(barTitle).toHaveCSS("opacity", "1")
})

test("shows a dive with no samples with its figures and the no-profile note @writes", async ({
  page,
  request,
  restore,
}) => {
  const log = await getLog(request)
  const id = `dive-${crypto.randomUUID()}`
  restore((request) => deleteDive(request, id))
  await uploadDive(request, id, {
    startTime: "2026-10-10T09:30:00",
    siteId: log.sites.find((site) => site.name === "Sodwana")!.id,
    duration: 2460,
    maxDepth: 18.6,
    notableAnimals: "Two green turtles",
  })

  await page.goto(`/dive/${id}`)
  await expect(figure(page, "Max depth")).toHaveText("18.6m")
  await expect(figure(page, "Duration")).toHaveText("41min")
  await expect(figure(page, "Avg depth")).toHaveText("—")
  await expect(figure(page, "Gas").first()).toHaveText("Air")
  await expect(figure(page, "CNS at end")).toHaveText("—")
  await expect(page.getByText("No dive computer profile.")).toBeVisible()
  await expect(page.getByText("Two green turtles")).toBeVisible()
})

test.describe("screenshots", () => {
  test.skip(({ browserName }) => browserName !== "chromium")

  for (const colorScheme of ["light", "dark"] as const) {
    test(`dive 390 ${colorScheme}`, async ({ page, request }) => {
      await page.emulateMedia({ colorScheme })
      // Tall enough for the whole detail, since <main> scrolls, not the page.
      await page.setViewportSize({ width: 390, height: 1900 })
      await page.goto(`/dive/${await diveId(request, 63)}`)
      await expect(figure(page, "OTU")).toHaveText("41")
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({
        path: `${import.meta.dirname}/__screenshots__/dive-390-${colorScheme}.png`,
      })
    })
  }
})
