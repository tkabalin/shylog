import { expect, type Page } from "@playwright/test"

import { diveId, getLog, patchDive, test } from "./api"
import { tapCard } from "./ui"

const header = (page: Page) => page.locator("header").first()
const cards = (page: Page) => page.locator("main a[href^='/dive/dive-']")
const month = (page: Page, label: string) =>
  page.getByRole("region", { name: label })

test("shows the seeded log as cards in month groups", async ({ page }) => {
  await page.goto("/")
  await expect(header(page)).toContainText("46dives logged")
  await expect(header(page)).toContainText(/\d+ h underwater/)
  await expect(header(page)).toContainText("deepest 42.3 m")
  await expect(cards(page)).toHaveCount(46)

  const july = month(page, "July 2026")
  await expect(july.getByRole("heading")).toHaveText("July 2026")
  await expect(july).toContainText("Dives: 15")
  await expect(july.locator("a")).toHaveCount(15)
  // Every fixture dive has samples, so every card has a sparkline.
  await expect(
    page.getByRole("img", { name: /^Depth profile to/ })
  ).toHaveCount(46)
})

test("puts the date before the place and shortens only the place", async ({
  page,
}) => {
  await page.goto("/")
  const card = cards(page).first()
  const line = card.locator("span.whitespace-nowrap.text-muted-foreground")
  await expect(line).toHaveText(/^\w{3} \d{1,2}·South Africa$/)
  const date = line.locator("> span").first()
  const place = line.locator("> span").last()
  // Squeeze the card until the line can't fit, as a long region would.
  await card.evaluate((el) => (el.style.width = "220px"))
  const [dateBox, placeBox] = await Promise.all([
    date.boundingBox(),
    place.boundingBox(),
  ])
  expect(dateBox!.width).toBeGreaterThan(0)
  expect(await date.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true
  )
  expect(await place.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true
  )
  expect(placeBox!.x).toBeGreaterThan(dateBox!.x)
})

test("searches sites, and leaves the header figures alone", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByRole("searchbox", { name: "Search dives" }).fill("Sodwana")
  // The seed names the Sodwana week's site Sodwana and every other dive's
  // site Unnamed site.
  await expect(cards(page)).not.toHaveCount(46)
  const count = await cards(page).count()
  expect(count).toBeGreaterThan(0)
  for (const site of await cards(page)
    .locator("span.truncate.font-medium")
    .allTextContents()) {
    expect(site).toBe("Sodwana")
  }
  await expect(header(page)).toContainText("46dives logged")
  await page
    .getByRole("searchbox", { name: "Search dives" })
    .fill("no such reef")
  await expect(page.getByText("No dives match.")).toBeVisible()
})

test("narrows the header figures to a year", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("combobox", { name: "Year, All years" }).click()
  await page.getByRole("option", { name: "2026" }).click()
  await expect(page).toHaveURL(/year=2026/)
  const count = await cards(page).count()
  expect(count).toBeLessThan(46)
  await expect(header(page)).toContainText(`${count}dives logged`)
  await expect(page.getByRole("region", { name: /2025$/ })).toHaveCount(0)
})

test("clears every filter at once, and only shows Clear while one is set", async ({
  page,
}) => {
  await page.goto("/?q=reef&year=2026&depth=10-30")
  const clear = page.getByRole("button", { name: "Clear filters" })
  await clear.click()
  await expect(page).toHaveURL("/?q=reef")
  // Folded away but still there, so it can slide back in: inert (which
  // Playwright's role queries don't see), and no wider than the gap.
  const fold = page.locator(
    "div[inert]:has(> div > [aria-label='Clear filters'])"
  )
  await expect(fold).toHaveCount(1)
  await expect
    .poll(() => fold.evaluate((el) => el.getBoundingClientRect().width))
    .toBe(0)
})

test("scrolls the count away and sticks the bar to the top", async ({
  page,
}) => {
  await page.goto("/")
  const main = page.locator("#main")
  const bar = page.locator("[data-log-bar]")
  await expect(header(page)).toContainText("46dives logged")
  await main.evaluate((el) => el.scrollBy(0, 400))
  await expect(bar).toHaveAttribute("data-stuck", "")
  await expect(bar).not.toContainText("dives")
  // One line under the bar and the month heading stuck below it.
  await expect(page.locator("[data-month-heading][data-stuck]")).toHaveCount(1)
  await expect(bar).toHaveAttribute("data-heading-stuck", "")
  // From the moment the bar sticks the line belongs to the headings: never
  // on the bar above the first month or between two, and on one at most.
  const slips = await main.evaluate(async (el) => {
    const frame = () => new Promise(requestAnimationFrame)
    const bar = document.querySelector("[data-log-bar]")!
    const found: number[] = []
    for (let y = 0; y <= 600; y += 4) {
      el.scrollTo(0, y)
      await frame()
      await frame()
      const marked = el.querySelectorAll("[data-month-heading][data-stuck]")
      if (
        (bar.hasAttribute("data-stuck") &&
          !bar.hasAttribute("data-heading-stuck")) ||
        marked.length > 1
      )
        found.push(y)
    }
    return found
  })
  expect(slips).toEqual([])
  await main.evaluate((el) => el.scrollTo(0, 400))
  // No notch in the test browser, so the bar keeps its 12px margin.
  expect((await bar.boundingBox())!.y).toBe(12)
  await expect(header(page)).not.toBeInViewport()
  // Nothing in the bar changes height, so the search stays put.
  const search = page.getByRole("searchbox", { name: "Search dives" })
  const before = (await search.boundingBox())!.y
  await main.evaluate((el) => el.scrollBy(0, 400))
  expect((await search.boundingBox())!.y).toBe(before)
  await main.evaluate((el) => el.scrollTo(0, 0))
  await expect(bar).not.toHaveAttribute("data-stuck")
  await expect(header(page)).toBeInViewport()
})

test("opens a dive from its card with no request but its samples", async ({
  page,
  request,
}) => {
  const id = await diveId(request, 63)
  await page.goto("/")
  await expect(cards(page)).toHaveCount(46)
  // The log copy is all the detail needs, so its figures are there at once;
  // only the profile chart asks for samples, the dive's own or, in the
  // background, every dive's.
  const requests: string[] = []
  page.on("request", (req) => {
    const path = new URL(req.url()).pathname
    const samples = [`/api/dives/${id}/samples`, "/api/samples"]
    if (path.startsWith("/api/") && !samples.includes(path))
      requests.push(req.url())
  })
  await tapCard(page.locator(`a[href='/dive/${id}']`))
  await expect(page).toHaveURL(`/dive/${id}`)
  await expect(page.getByText("Dive 37")).toBeVisible()
  await expect(page.getByText("MOD at 1.4 bar")).toBeVisible()
  expect(requests).toEqual([])
})

test("leaves an ignored dive out of the counts @writes", async ({
  page,
  request,
  restore,
}) => {
  const id = await diveId(request, 63)
  // Counted from the log as it is, without this dive, so a change left
  // behind, even this test's own, can't fail it.
  const live = (await getLog(request)).dives.filter((dive) => !dive.deletedAt)
  const counted = live.filter((dive) => !dive.ignored && dive.id !== id)
  const july = counted.filter((d) => d.startTime.startsWith("2026-07")).length
  restore((request) => patchDive(request, id, { ignored: false }))
  await patchDive(request, id, { ignored: true })

  await page.goto("/")
  await expect(header(page)).toContainText(`${counted.length}dives logged`)
  await expect(month(page, "July 2026")).toContainText(`Dives: ${july}`)
  // Still listed, with the eye-off icon in place of its number.
  await expect(cards(page)).toHaveCount(live.length)
  const card = page.locator(`a[href='/dive/${id}']`)
  await expect(card.getByText("Ignored")).toHaveClass(/sr-only/)
  await expect(card.locator("svg.tabler-icon-eye-off")).toBeVisible()

  await tapCard(card)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(page.getByText("Ignored")).toHaveClass(/sr-only/)
  await expect(page.locator("main svg.tabler-icon-eye-off")).toBeVisible()
  await expect(page.getByText(/^Dive \d+$/)).toHaveCount(0)
})

// Evidence for review, not baselines: the folder is gitignored.
test.describe("screenshots", () => {
  test.skip(({ browserName }) => browserName !== "chromium")

  for (const colorScheme of ["light", "dark"] as const) {
    test(`log 390 ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto("/")
      await expect(cards(page)).toHaveCount(46)
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({
        path: `${import.meta.dirname}/__screenshots__/log-390-${colorScheme}.png`,
      })
      await page.locator("#main").evaluate((el) => el.scrollBy(0, 600))
      await expect(page.locator("[data-log-bar]")).toHaveAttribute(
        "data-stuck",
        ""
      )
      await page.waitForTimeout(300)
      await page.screenshot({
        path: `${import.meta.dirname}/__screenshots__/log-390-${colorScheme}-collapsed.png`,
      })
    })
  }
})
