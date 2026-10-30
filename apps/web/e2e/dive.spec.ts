import { expect, type Page } from "@playwright/test"

import { deleteDive, diveId, getLog, test, uploadDive } from "./api"
import { tapCard } from "./ui"

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
    /^\d+(\.\d)?\u00a0–\u00a0\d+(\.\d)?°C$/
  )
  // No cylinder pressures in the export, so no SAC row at all.
  await expect(figure(page, "SAC rate")).toHaveCount(0)
  await expect(figure(page, "Gas")).toHaveText("Nitrox 32.0%")
  await expect(figure(page, "Max PO₂")).toHaveText("1.38bar")
  await expect(figure(page, "MOD at 1.4 bar")).toHaveText("33.2m")
  // Subsurface's own figures for the dive (packages/core/test/subsurface.ts).
  await expect(figure(page, "CNS at end")).toHaveText("15%")
  await expect(figure(page, "OTU")).toHaveText("41")
  await expect(page.getByText("Suunto D4i")).toBeVisible()
})

test("explains the OTU limit when its info is tapped", async ({
  page,
  request,
}) => {
  await page.goto(`/dive/${await diveId(request, 63)}`)
  await page.getByRole("button", { name: "About OTU" }).click()
  const note = page.getByText("NOAA’s limit for repeated days of diving")
  await expect(note).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(note).toBeHidden()
})

test("sends the Log link to a fresh Log when the dive was opened directly", async ({
  page,
  request,
}) => {
  // Something before it in history that isn't the Log.
  await page.goto("/stats")
  // On WebKit the router's own first navigation can still be running and
  // interrupt the next goto, so wait for the page it renders.
  await expect(page.getByRole("heading", { name: "Stats" })).toBeAttached()
  await page.goto(`/dive/${await diveId(request, 63)}`)
  await page
    .locator("header")
    .first()
    .getByRole("link", { name: "Log" })
    .click()
  await expect(page).toHaveURL("/")
  // The Log itself, not the dive still shown while the Log's code loads (its
  // own links start /dive/ too): going back mid-load would reload the page.
  await expect(
    page.getByRole("heading", { level: 1, name: "Log" })
  ).toBeAttached()
  // The Log took the dive's place, so back skips the dive.
  await page.goBack()
  await expect(page).toHaveURL("/stats")
})

test("goes back to the Log list from a tab opened on a dive", async ({
  page,
}) => {
  await page.goto("/")
  await tapCard(page.locator("main a[href^='/dive/dive-']").first())
  await expect(page).toHaveURL(/\/dive\//)
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Stats" })
    .click()
  await expect(page).toHaveURL("/stats")
  // Stats took the dive's place; the Log list is behind it.
  await page.goBack()
  await expect(page).toHaveURL("/")
  await expect(
    page.locator("main a[href^='/dive/dive-']").first()
  ).toBeVisible()
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
  // Solid from the frame a fast flick starts, before any scroll handler
  // runs, so text never shows through it.
  const background = await page.locator("#main").evaluate((el) => {
    el.scrollBy(0, 600)
    const color = getComputedStyle(el.querySelector("header")!).backgroundColor
    el.scrollTo(0, 0)
    return color
  })
  // Neither transparent nor an alpha colour such as oklch(1 0 0 / 85%).
  expect(background).not.toBe("rgba(0, 0, 0, 0)")
  expect(background).not.toContain("/")
  // Any scroll gives the bar its line; the title waits for the h1.
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
  await expect(figure(page, "Gas")).toHaveText("Air")
  await expect(figure(page, "CNS at end")).toHaveText("—")
  await expect(page.getByText("No dive computer profile.")).toBeVisible()
  await expect(page.getByText("Two green turtles")).toBeVisible()
})

test("sets a dive's SAC rate against the five before it @writes", async ({
  page,
  request,
  restore,
}) => {
  const log = await getLog(request)
  const siteId = log.sites.find((site) => site.name === "Sodwana")!.id
  const ids: string[] = []
  // Six dives with pressures, a day apart, the last breathing the least.
  for (const [day, endPressure] of [60, 70, 50, 80, 60, 100].entries()) {
    const id = `dive-${crypto.randomUUID()}`
    ids.push(id)
    restore((request) => deleteDive(request, id))
    await uploadDive(request, id, {
      startTime: `2026-10-${String(day + 20)}T09:30:00`,
      siteId,
      duration: 2700,
      maxDepth: 18,
      averageDepth: 12,
      cylinderVolume: 12000,
      startPressure: 200,
      endPressure,
    })
  }

  // The first has no earlier rates, so its SAC shows alone.
  await page.goto(`/dive/${ids[0]}`)
  await expect(figure(page, "SAC rate")).toHaveText(/^\d+\.\dL\/min$/)
  await expect(
    page.getByRole("button", { name: "About the SAC comparison" })
  ).toHaveCount(0)

  await page.goto(`/dive/${ids[5]}`)
  await expect(figure(page, "SAC rate")).toContainText(
    "lower than your last 5 dives"
  )
  await page.getByRole("button", { name: "About the SAC comparison" }).click()
  await expect(page.getByText("Against your recent dives")).toBeVisible()
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
