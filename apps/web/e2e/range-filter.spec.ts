import { expect, test, type Page } from "@playwright/test"

import { getLog } from "./api"
import { still } from "./ui"

const cards = (page: Page) => page.locator("main a[href^='/dive/']")
const header = (page: Page) => page.locator("header").first()
// As the filter reads a dive: whole metres and minutes.
const metres = (depth: number) => Math.round(Math.round(depth * 1000) / 1000)

test("narrows the Log to a depth range", async ({ page, request }) => {
  const log = await getLog(request)
  const expected = log.dives.filter(
    (dive) => metres(dive.maxDepth) >= 18 && metres(dive.maxDepth) <= 30
  ).length

  await page.goto("/")
  await expect(cards(page)).toHaveCount(46)
  const pill = page.getByRole("button", { name: "Depth" })
  await pill.click()
  const sheet = page.getByRole("dialog", { name: "Depth" })
  await expect(sheet).toBeVisible()

  const min = sheet.getByRole("slider", { name: "Minimum depth" })
  const max = sheet.getByRole("slider", { name: "Maximum depth" })
  await expect(min).toHaveAttribute("aria-valuetext", "0 metres")
  await expect(max).toHaveAttribute("aria-valuetext", "More than 40 metres")
  await expect(sheet.getByText("> 40 m")).toBeVisible()
  const reset = sheet.getByRole("button", { name: "Reset" })
  await expect(reset).toBeDisabled()

  // Dragging a handle moves the label above it, once the sheet has
  // finished sliding in.
  const thumb = sheet.locator("[data-slot=slider-thumb]").first()
  await still(thumb)
  const box = (await thumb.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect(thumb).not.toHaveText("0 m")
  await expect(reset).toBeEnabled()

  // The keyboard sets it exactly.
  await min.focus()
  await page.keyboard.press("Home")
  for (let i = 0; i < 18; i++) await page.keyboard.press("ArrowRight")
  await max.focus()
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft")
  await expect(min).toHaveAttribute("aria-valuetext", "18 metres")
  await expect(max).toHaveAttribute("aria-valuetext", "30 metres")
  await expect(sheet.getByText("18 m", { exact: true })).toBeVisible()
  await expect(sheet.getByText("30 m", { exact: true })).toBeVisible()

  await sheet.getByRole("button", { name: "Apply" }).click()
  await expect(sheet).toBeHidden()
  await expect(cards(page)).toHaveCount(expected)
  await expect(header(page)).toContainText(`${expected}dives logged`)
  const active = page.getByRole("button", { name: "Depth, 18–30 m" })
  await expect(active).toHaveAttribute("data-active", "")
  // The year pill's active tint.
  await expect(active).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)")

  // Reset restores the full range, and Apply clears the filter.
  await active.click()
  await sheet.getByRole("button", { name: "Reset" }).click()
  await expect(min).toHaveAttribute("aria-valuetext", "0 metres")
  await expect(max).toHaveAttribute("aria-valuetext", "More than 40 metres")
  await sheet.getByRole("button", { name: "Apply" }).click()
  await expect(cards(page)).toHaveCount(46)
  await expect(page.getByRole("button", { name: "Depth" })).not.toHaveAttribute(
    "data-active"
  )
})

test("keeps the longest dives when the duration range is open-ended", async ({
  page,
  request,
}) => {
  const log = await getLog(request)
  const expected = log.dives.filter(
    (dive) => Math.round(dive.duration / 60) >= 50
  ).length

  await page.goto("/")
  await page.getByRole("button", { name: "Duration" }).click()
  const sheet = page.getByRole("dialog", { name: "Duration" })
  await sheet.getByRole("slider", { name: "Minimum duration" }).focus()
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight")
  await sheet.getByRole("button", { name: "Apply" }).click()
  await expect(
    page.getByRole("button", { name: "Duration, ≥ 50 min" })
  ).toBeVisible()
  await expect(cards(page)).toHaveCount(expected)
})

test("gives each handle a touch area of about 44 px", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Depth" }).click()
  const thumb = page.locator("[data-slot=slider-thumb]").first()
  const size = await thumb.evaluate((el) => {
    const after = getComputedStyle(el, "::after")
    return el.getBoundingClientRect().height - 2 * parseFloat(after.top)
  })
  expect(size).toBeGreaterThanOrEqual(44)
})

test.describe("screenshots", () => {
  test.skip(({ browserName }) => browserName !== "chromium")

  for (const colorScheme of ["light", "dark"] as const) {
    test(`range sheet 390 ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto("/?depth=18-30")
      await page.getByRole("button", { name: "Depth, 18–30 m" }).click()
      await expect(page.getByRole("dialog", { name: "Depth" })).toBeVisible()
      await page.waitForTimeout(600)
      await page.screenshot({
        path: `${import.meta.dirname}/__screenshots__/range-390-${colorScheme}.png`,
      })
    })
  }
})
