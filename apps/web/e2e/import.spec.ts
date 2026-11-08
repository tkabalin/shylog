import { readFileSync } from "node:fs"
import { expect, type APIRequestContext, type Page } from "@playwright/test"

import { deleteDive, getLog, test, uploadDive } from "./api"
import { still } from "./ui"

// The D4i fixture moved ten years on, and further on each retry and
// repeat (CI retries twice), so the seeded log (2019 to 2026) has nothing
// on its days and no earlier attempt's fingerprints match, as a deleted
// dive's keep blocking. Its 20 July has three scuba dives.
const fixture = readFileSync(
  new URL("../../../fixtures/subsurface/d4i-2026-10-12.uddf", import.meta.url),
  "utf8"
)
const moved = (years: number) =>
  fixture.replace(
    /<datetime>(\d{4})/g,
    (_, year: string) => `<datetime>${Number(year) + years}`
  )

// The years the moved file's dives are in.
const fileYears = (years: number) =>
  [
    ...new Set([...fixture.matchAll(/<datetime>(\d{4})/g)].map((m) => m[1])),
  ].map((year) => Number(year) + years)

// A figure on the done screen's summary, by its label.
const summaryValue = (page: Page, label: string) =>
  page.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd")

// Everything the test logged or imported, by its moved years, and any
// preview it left waiting.
async function undo(request: APIRequestContext, years: number[]) {
  const log = await getLog(request)
  for (const dive of log.dives)
    if (
      !dive.deletedAt &&
      years.some((year) => dive.startTime.startsWith(String(year)))
    )
      await deleteDive(request, dive.id)
  const origin = new URL(test.info().project.use.baseURL!).origin
  const pending = await request.get("/api/import/pending", {
    headers: { "X-Shylog": "1", Origin: origin },
  })
  const { preview } = (await pending.json()) as {
    preview: { id: string } | null
  }
  if (preview)
    await request.delete(`/api/import/${preview.id}`, {
      headers: { "X-Shylog": "1", Origin: origin },
    })
}

// On a phone Choose file sits just above the tab bar, in thumb reach, even
// when the Last import makes the page scroll.
async function expectChooseInReach(page: Page) {
  const button = await page
    .getByText("Choose file", { exact: true })
    .boundingBox()
  const tabs = await page
    .getByRole("navigation", { name: "Main" })
    .boundingBox()
  expect(tabs!.y - (button!.y + button!.height)).toBeLessThan(24)
}

test("imports an export against hand-logged dives, end to end @writes", async ({
  page,
  restore,
}, testInfo) => {
  test.slow()
  const years = 10 + testInfo.retry + 3 * testInfo.repeatEachIndex
  const year = 2026 + years
  restore((request) => undo(request, fileYears(years)))

  // Three hand-logged dives on the moved 20 July, one a metre deeper than
  // the computer recorded, so the summary lists it as differing.
  const site = (await getLog(page.request)).sites[0].id
  const day = `${year}-07-20`
  for (const [n, time, duration, maxDepth] of [
    [1, "08:05:00", 2160, 33.6],
    [2, "09:57:00", 3660, 16.2],
    [3, "12:00:00", 3540, 14.1],
  ] as const)
    await uploadDive(page.request, `dive-import-${year}-${n}`, {
      startTime: `${day}T${time}`,
      duration,
      maxDepth,
      siteId: site,
    })

  await page.goto("/")
  await page.goto("/import")
  await expectChooseInReach(page)
  await page.locator('input[type="file"]').setInputFiles({
    name: "d4i.uddf",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(moved(years)),
  })
  await expect(page).toHaveURL(/\/import\/review$/)
  const footer = page.getByText(/paired · \d+ new/)
  await expect(footer).toHaveText("3 paired · 39 new")
  const leftOut = page.getByRole("button", { name: /^Left out/ })
  // 26 freedives and 4 dives under five minutes.
  await expect(leftOut).toContainText("30")

  // The new dives all unticked at once, and ticked again.
  const added = page.getByRole("checkbox", { name: /^Add the D4i dive/ })
  await page.getByRole("button", { name: "Deselect all" }).click()
  await expect(footer).toHaveText(/^3 paired · 0 new/)
  await expect(added.and(page.locator("[aria-checked=true]"))).toHaveCount(0)
  await page.getByRole("button", { name: "Select all" }).click()
  await expect(footer).toHaveText("3 paired · 39 new")

  // Shifting the day's clock by an hour unpairs its dives; its reset pairs
  // them again.
  await page.getByRole("button", { name: "Adjust the D4i clock" }).click()
  const clock = page.getByRole("dialog")
  await still(clock)
  await expect(clock.getByRole("status")).toHaveText(
    "3 of 3 logged dives paired"
  )
  for (let i = 0; i < 4; i++)
    await clock.getByRole("button", { name: "Forward 15 minutes" }).click()
  await expect(clock.getByRole("status")).toHaveText(
    "0 of 3 logged dives paired"
  )
  // Unpaired, the logged dives are listed as the diver's own and counted
  // as unchanged.
  await clock.getByRole("button", { name: "Done" }).click()
  await expect(
    page.getByRole("heading", { name: "Your dives with no match" })
  ).toBeVisible()
  await expect(footer).toHaveText("0 paired · 42 new · 3 unchanged")
  await page.getByRole("button", { name: "Adjust the D4i clock" }).click()
  await still(clock)
  await clock.getByRole("button", { name: "Reset" }).click()
  await expect(clock.getByRole("status")).toHaveText(
    "3 of 3 logged dives paired"
  )
  await clock.getByRole("button", { name: "Done" }).click()
  await expect(footer).toHaveText("3 paired · 39 new")

  // One pairing changed to Don't import, from the Paired list; back from
  // it returns to the review.
  await page.getByRole("link", { name: /^Paired/ }).click()
  await expect(page).toHaveURL(/\/import\/review\/paired$/)
  await page.getByRole("link").filter({ hasText: "12:00" }).click()
  await page.getByRole("radio", { name: /Don’t import/ }).click()
  await page.getByRole("button", { name: "Done" }).click()
  await expect(page).toHaveURL(/\/import\/review\/paired$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/import\/review$/)
  await expect(footer).toHaveText("2 paired · 39 new · 1 skipped · 1 unchanged")

  // One freedive included.
  await leftOut.click()
  await page
    .getByRole("button", { name: /^Include the freedive/ })
    .first()
    .click()
  await expect(footer).toHaveText("2 paired · 40 new · 1 skipped · 1 unchanged")

  await page.getByRole("button", { name: "Import 42 dives" }).click()
  await expect(page).toHaveURL(/\/import\/done$/)
  await expect(summaryValue(page, "Paired with your dives")).toHaveText("2")
  await expect(summaryValue(page, "Added as new dives")).toHaveText("39")
  await expect(summaryValue(page, "Left-out dives included")).toHaveText("1")
  await expect(summaryValue(page, "Already imported")).toHaveText("0")
  await expect(summaryValue(page, "left out")).toHaveText("29")
  await expect(page.getByText("1 dive differs from the D4i")).toBeVisible()

  // The differing dive's detail has the banner, and its form the ✓ and ✕.
  await page
    .getByRole("link")
    .filter({ hasText: `20 Jul ${year}` })
    .click()
  await expect(page).toHaveURL(/\/dive\/dive-import-/)
  await page.getByRole("link", { name: /values? differs? from/ }).click()
  await expect(
    page.getByRole("group", { name: "The D4i recorded a different max depth" })
  ).toBeVisible()
  await page.goBack()
  await page.goBack()
  await expect(page).toHaveURL(/\/import\/done$/)

  // Back from the summary leaves the import, never reaching the review.
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
  // WebKit is still loading the Log behind the URL change.
  await expect(page.getByRole("heading", { name: "Log" })).toBeAttached()

  // The Import screen shows the last import, and the same file again is
  // all imported, but for the dive not imported, which pairs again.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Import" })
    .click()
  await expect(page.getByText("Last import")).toBeVisible()
  await expect(page.getByText(/^72 computer dives from/)).toBeVisible()
  await expectChooseInReach(page)
  await page.locator('input[type="file"]').setInputFiles({
    name: "d4i.uddf",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(moved(years)),
  })
  await expect(page).toHaveURL(/\/import\/review$/)
  await expect(
    page.locator("div", { hasText: /^Already imported/ }).last()
  ).toContainText("71")
  await expect(footer).toHaveText("1 paired · 0 new")
})

test.describe("at desktop width", () => {
  test.use({ viewport: { width: 1024, height: 768 } })

  test("reviews in a breadcrumbed column and discards from a dialog @writes", async ({
    page,
    restore,
  }, testInfo) => {
    // Its own years, so it never meets the phone test's fingerprints.
    const years = 100 + testInfo.retry + 3 * testInfo.repeatEachIndex
    restore((request) => undo(request, fileYears(years)))
    await page.goto("/import")
    // The new preview's waiting card never flashes before the review opens.
    await page.evaluate(() => {
      new MutationObserver(() => {
        if (document.body.textContent?.includes("Import waiting for review"))
          document.body.dataset.flashed = ""
      }).observe(document.body, { childList: true, subtree: true })
    })
    await page.locator('input[type="file"]').setInputFiles({
      name: "d4i.uddf",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(moved(years)),
    })
    await expect(page).toHaveURL(/\/import\/review$/)
    await expect(page.locator("body")).not.toHaveAttribute("data-flashed")
    const crumbs = page.getByRole("navigation", { name: "breadcrumb" })
    await expect(crumbs).toContainText("Review")

    // Hovering a new dive darkens its whole row, the check column too.
    const link = page.locator('a[href*="/import/review/computer/"]').first()
    await link.hover()
    await expect(link).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
    const check = page.getByRole("checkbox", { name: /^Add the D4i dive/ })
    expect((await link.boundingBox())!.x).toBe(
      (await check.first().boundingBox())!.x
    )

    // The clock sheet is a dialog with the day as a Select.
    await page.getByRole("button", { name: "Adjust the D4i clock" }).click()
    const clock = page.getByRole("dialog", { name: "D4i clock" })
    await expect(clock).toBeVisible()
    await expect(clock.getByRole("combobox", { name: /^Day/ })).toBeVisible()
    await clock.getByRole("button", { name: "Done" }).click()

    await page.getByRole("button", { name: "Discard" }).click()
    const confirm = page.getByRole("alertdialog", {
      name: "Discard this import?",
    })
    await confirm.getByRole("button", { name: "Discard import" }).click()
    await expect(page).toHaveURL(/\/import$/)
    await expect(page.getByText("Import waiting for review")).toHaveCount(0)
  })
})
