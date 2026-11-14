import { expect, type Page } from "@playwright/test"

import { test } from "./api"

const patterns = (page: Page) => page.getByRole("region", { name: "Patterns" })
const statsTab = (page: Page) =>
  page.getByRole("navigation", { name: "Main" }).getByRole("link", {
    name: "Stats",
  })

// The seeded D4i log's 2026 supports two patterns that can lead; its
// habits and records stay in All patterns.
test("shows the patterns the year supports, each opening its groups in place", async ({
  page,
}) => {
  await page.goto("/stats?year=2026")
  const rows = patterns(page).getByRole("button")
  await expect(rows).toHaveText([
    "Ascent alarms are up 2.2 a dive since January.",
    "Your dives are 17 min shorter when you go 30 m or deeper.",
  ])

  await rows.nth(1).click()
  await expect(rows.nth(1)).toHaveAttribute("aria-expanded", "true")
  const groups = patterns(page).getByRole("definition")
  // Each group's name with its dive count under it, and its figure.
  await expect(patterns(page).getByRole("term")).toHaveText([
    /^30\sm\sor\sdeeper\s5\sdives$/,
    /^Shallower\sthan\s30\sm\s30\sdives$/,
  ])
  await expect(groups).toHaveText(["37 min", "54 min"])
  // Groups only: nothing in them opens a dive or the Log.
  await expect(patterns(page).getByRole("link")).toHaveText([/^All patterns/])
})

test("All patterns lists every pattern by measure, and Back returns to the year", async ({
  page,
}) => {
  await page.goto("/stats?year=2026")
  await patterns(page)
    .getByRole("link", { name: /All patterns/ })
    .click()
  await expect(page).toHaveURL("/stats/patterns?year=2026")
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Ascent alarms",
    "Max depth",
    "Duration",
    "Habits",
    "Records",
  ])
  // Records say it all in the sentence, so they don't open.
  const records = page.getByRole("region", { name: "Records" })
  await expect(records).toContainText(
    "Your busiest month was July 2026, with 15 dives."
  )
  await expect(records.getByRole("button")).toHaveCount(0)

  // Pushed over Statistics, so Back pops to it and the Stats tab goes back.
  await page.goBack()
  await expect(page).toHaveURL("/stats?year=2026")
  await page.goForward()
  await expect(page).toHaveURL("/stats/patterns?year=2026")
  await statsTab(page).click()
  await expect(page).toHaveURL("/stats?year=2026")
  await page.goForward()
  await page.getByRole("link", { name: "Stats" }).first().click()
  await expect(page).toHaveURL("/stats?year=2026")
})

test("hides the section when no pattern can lead", async ({ page }) => {
  // 2025 has two dives: records only.
  await page.goto("/stats?year=2025")
  await expect(
    page.getByRole("heading", { name: "Dives per month" })
  ).toBeVisible()
  await expect(page.getByRole("heading", { name: "Patterns" })).toHaveCount(0)
})

test.describe("at desktop width", () => {
  test.use({ viewport: { width: 1024, height: 768 } })

  test("shows All patterns under a breadcrumb back to Statistics", async ({
    page,
  }) => {
    await page.goto("/stats/patterns")
    const crumb = page.getByRole("navigation", { name: "breadcrumb" })
    await expect(crumb).toContainText("All patterns")
    await crumb.getByRole("link", { name: "Stats" }).click()
    await expect(page).toHaveURL("/stats")
  })
})
