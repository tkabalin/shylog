import { expect, type Page } from "@playwright/test"

import { diveId, fixtureStart, getLog, test } from "./api"
import type { Log } from "../src/api/client"

const header = (page: Page) => page.locator("header").first()
const statsTab = (page: Page) =>
  page.getByRole("navigation", { name: "Main" }).getByRole("link", {
    name: "Stats",
  })
// A record's link names its site; the deepest comes first.
const record = (page: Page, site: string) =>
  page.getByRole("link", { name: site, exact: true }).first()
// A row of the Sites list, which opens the site.
const siteRow = (page: Page, site: string) =>
  page
    .getByRole("list", { name: "Sites" })
    .getByRole("link", { name: new RegExp(`^${site}`) })

// The server's log changed before the phone gets it, so the early-days,
// empty and tag states need no writes.
async function serveLog(
  page: Page,
  request: Parameters<typeof getLog>[0],
  change: (log: Log) => Log
) {
  const body = JSON.stringify(change(await getLog(request)))
  await page.route("**/api/log", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body })
  )
}

// The first n dives only.
const first = (n: number) => (log: Log) => ({
  ...log,
  version: `first-${n}`,
  dives: [...log.dives]
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, n),
})

test("opens on all time, and the year chip switches every figure without a history entry", async ({
  page,
}) => {
  await page.goto("/stats")
  await expect(header(page)).toContainText("42dives")
  await expect(
    page.getByRole("heading", { name: "Dives per year" })
  ).toBeVisible()
  await expect(page.getByText("736 m", { exact: true })).toBeVisible()
  const entries = await page.evaluate(() => history.length)

  // The Log's year menu, on a phone too.
  await page.getByRole("combobox", { name: "Year, All time" }).click()
  const menu = page.getByRole("listbox")
  await expect(menu.getByRole("option")).toHaveText([
    "All time",
    "2026",
    "2025",
    "2019",
  ])
  await menu.getByRole("option", { name: "2026" }).click()

  await expect(page).toHaveURL("/stats?year=2026")
  await expect(header(page)).toContainText("35dives in")
  await expect(page.getByRole("combobox", { name: "Year, 2026" })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Dives per month" })
  ).toBeVisible()
  await expect(page.getByText("609 m", { exact: true })).toBeVisible()
  expect(await page.evaluate(() => history.length)).toBe(entries)
})

test("a record opens its dive, and Back returns to the same year", async ({
  page,
  request,
}) => {
  const id = await diveId(request, 54)
  await page.goto("/stats?year=2026")
  await record(page, "Sodwana").click()
  await expect(page).toHaveURL(`/dive/${id}`)
  // Statistics stays the current tab under its dive.
  await expect(statsTab(page)).toHaveAttribute("aria-current", "page")
  // The dive's own Back link, not the tab, which goes back too.
  await page
    .locator("#main")
    .getByRole("link", { name: "Stats", exact: true })
    .click()
  await expect(page).toHaveURL("/stats?year=2026")
  await expect(header(page)).toContainText("35dives in")
  // The record's dive was pushed, so the browser's Back pops it too.
  await record(page, "Sodwana").click()
  await expect(page).toHaveURL(`/dive/${id}`)
  await page.goBack()
  await expect(page).toHaveURL("/stats?year=2026")
})

test("shows the next milestone, and the ones passed open their dives", async ({
  page,
  request,
}) => {
  const log = await getLog(request)
  const fortieth = log.dives.find((dive) => dive.number === 40)!
  await page.goto("/stats")
  await expect(page.getByText("8 dives to dive 50")).toBeVisible()
  await expect(page.getByText("Master Diver", { exact: true })).toBeVisible()
  await expect(
    page.getByRole("progressbar", { name: "Dives towards dive 50" })
  ).toHaveAttribute("aria-valuenow", "20")

  await page.getByRole("button", { name: /^Milestones passed/ }).click()
  const passed = page.getByRole("list", { name: "Milestones passed" })
  await expect(passed.getByRole("link")).toHaveCount(1)
  await expect(passed.getByRole("link")).toContainText(
    "Can start Divemaster training"
  )
  await passed.getByRole("link").click()
  await expect(page).toHaveURL(`/dive/${fortieth.id}`)
  // Pushed over Statistics, which Back returns to with the list open.
  await page.goBack()
  await expect(page).toHaveURL("/stats")
  await expect(passed.getByRole("link")).toHaveCount(1)

  // The whole log's, so an earlier year leaves it out.
  await page.getByRole("combobox", { name: "Year, All time" }).click()
  await page.getByRole("option", { name: "2019" }).click()
  await expect(header(page)).toContainText("5dives in")
  await expect(page.getByText(/dives? to dive/)).toHaveCount(0)
})

test("a site opens its screen over Statistics, and Back returns to the same year", async ({
  page,
}) => {
  await page.goto("/stats?year=2026")
  await siteRow(page, "Sodwana").click()
  await expect(page).toHaveURL(/\/you\/entities\/site\/site-/)
  // Stats stays the current tab, though the screen is inside You.
  await expect(statsTab(page)).toHaveAttribute("aria-current", "page")
  await page
    .locator("#main")
    .getByRole("link", { name: "Stats", exact: true })
    .click()
  await expect(page).toHaveURL("/stats?year=2026")
  // Pushed, so the browser's Back pops it too.
  await siteRow(page, "Sodwana").click()
  await expect(page).toHaveURL(/\/you\/entities\/site\/site-/)
  // One of its dives keeps Stats current, and Back names the site.
  await page.locator("#main a[href^='/dive/dive-']").first().click()
  await expect(page).toHaveURL(/\/dive\/dive-/)
  await expect(statsTab(page)).toHaveAttribute("aria-current", "page")
  await expect(
    page.locator("#main").getByRole("link", { name: "Sodwana", exact: true })
  ).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/you\/entities\/site\/site-/)
  await page.goBack()
  await expect(page).toHaveURL("/stats?year=2026")
})

test("a tag opens the Log filtered by it and the year", async ({
  page,
  request,
}) => {
  await serveLog(page, request, (log) => {
    const dive = log.dives.find((d) => d.startTime === fixtureStart[63])!
    return {
      ...log,
      version: "tagged",
      links: [
        ...log.links,
        { diveId: dive.id, type: "tag", target: "night", position: 0 },
      ],
    }
  })
  await page.goto("/stats?year=2026")
  // A tab move, so it replaces Statistics rather than stacking on it.
  const entries = await page.evaluate(() => history.length)
  await page
    .getByRole("link", { name: "Night, 1 dive. Show in the Log" })
    .click()
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/" &&
      url.searchParams.get("year") === "2026" &&
      url.searchParams.get("tags") === "night"
  )
  await expect(page.locator("main a[href^='/dive/dive-']")).toHaveCount(1)
  expect(await page.evaluate(() => history.length)).toBe(entries)
})

test("each chart has a table alternative", async ({ page }) => {
  await page.goto("/stats")
  await expect(header(page)).toContainText("42dives")
  for (const caption of ["Dives per year", "Dives by maximum depth"])
    await expect(page.getByRole("table", { name: caption })).toBeAttached()
  // A habit's strip, and its table, are behind its row.
  await page.getByRole("button", { name: /^Gas/ }).click()
  await expect(page.getByRole("table", { name: "Gas" })).toBeAttached()
  await expect(
    page.getByRole("table", { name: "Dives per year" }).getByRole("row")
  ).toHaveCount(9)
})

test("below five dives shows the totals, records and how far off the rest is", async ({
  page,
  request,
}) => {
  await serveLog(page, request, first(2))
  await page.goto("/stats")
  await expect(header(page)).toContainText("2dives logged")
  // No year to choose until the charts come.
  await expect(page.getByRole("combobox", { name: /^Year,/ })).toHaveCount(0)
  await expect(record(page, "Unnamed site")).toBeVisible()
  const progress = page.getByRole("progressbar", {
    name: "Dives logged towards more stats",
  })
  await expect(progress).toHaveAttribute("aria-valuenow", "40")
  await expect(page.getByText("2 of 5")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Depth" })).toHaveCount(0)
})

test("on a first visit with no server, says so and tries again", async ({
  page,
}) => {
  await page.route("**/api/log", (route) => route.abort())
  await page.goto("/stats")
  await expect(page.getByText("Can't reach Shylog")).toBeVisible()
  await page.unroute("**/api/log")
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(header(page)).toContainText("42dives")
})

test("with no dives says so and offers to log one", async ({
  page,
  request,
}) => {
  await serveLog(page, request, first(0))
  await page.goto("/stats")
  await expect(page.getByText("No stats yet")).toBeVisible()
  await expect(page.getByRole("link", { name: "Log a dive" })).toHaveAttribute(
    "href",
    "/dive/new"
  )
})

test("the screen's code waits for the Stats tab and starts on its touch", async ({
  page,
}) => {
  // The screen's own code: its split route component and src/stats/ on
  // the dev server (the route's definition loads with the route tree).
  const screen = (url: string) =>
    /\/src\/stats\/|\/routes\/stats\.tsx\?tsr-split/.test(url)
  const stats: string[] = []
  page.on("request", (req) => {
    if (screen(req.url())) stats.push(req.url())
  })
  // The Log's idle work ends with its preload of the profile chart, so
  // once that has loaded, Statistics would have too if anything asked.
  const chart = page.waitForRequest((req) =>
    /\/src\/chart\/profile\.tsx/.test(req.url())
  )
  await page.goto("/")
  await expect(header(page)).toContainText("dives logged")
  await (await chart).response()
  expect(stats).toEqual([])
  const loading = page.waitForRequest((req) => screen(req.url()))
  await statsTab(page).dispatchEvent("touchstart")
  await loading
  expect(page.url()).not.toContain("/stats")
})

test("statistics open with no signal on a phone that never opened them @built", async ({
  page,
  context,
}) => {
  await page.goto("/")
  await expect(header(page)).toContainText("42dives logged")
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: 15_000,
    })
    .toBe(true)
  // The worker precaches every chunk, so give it time to finish.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const keys = await caches.keys()
          for (const key of keys) {
            const cache = await caches.open(key)
            const urls = (await cache.keys()).map((req) => req.url)
            if (urls.some((url) => /\/stats-[\w-]+\.js/.test(url))) return true
          }
          return false
        }),
      { timeout: 15_000 }
    )
    .toBe(true)
  await context.setOffline(true)
  await statsTab(page).click()
  await expect(page).toHaveURL("/stats")
  await expect(header(page)).toContainText("42dives")
  await expect(record(page, "Sodwana")).toBeVisible()
})
