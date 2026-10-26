import { expect, type Page } from "@playwright/test"

import { diveId, test } from "./api"

const profile = (page: Page) =>
  page.locator("section[aria-labelledby=profile-h]")
// The crosshair's readout over the chart: depth, time, alarm and rate.
const readout = (page: Page) => profile(page).locator("[data-slot=readout]")

test("draws dive 54's ascent alarms and moves the crosshair to one", async ({
  page,
  request,
}) => {
  await page.goto(`/dive/${await diveId(request, 54)}`)
  const card = profile(page)

  // Five bands, each with its icon and no text: the list names them.
  await expect(card.locator(".recharts-reference-area")).toHaveCount(5)
  await expect(card.locator("svg g.text-warn")).toHaveCount(5)
  await expect(card.locator("svg text", { hasText: "Ascent" })).toHaveCount(0)

  const alarms = card.getByRole("region", { name: "Alarms" })
  const rows = alarms.getByRole("button")
  await expect(rows).toHaveCount(5)
  await expect(rows.first()).toContainText("10.9 m/min")
  await expect(rows.nth(2)).toContainText("16.2 m/min")

  // At rest on the deepest point, then on the first alarm's fastest step.
  await expect(readout(page)).toContainText("42.2m")
  await expect(readout(page)).toContainText("at 3:50")
  await rows.first().click()
  await expect(readout(page)).toContainText("at 4:17")
  await expect(readout(page)).toContainText("Ascent alarm")
  await expect(readout(page)).toContainText("+10.9 m/min")

  // No MOD line: air's 56.2 m is past the 50 m axis.
  await expect(card.getByText(/^MOD /)).toHaveCount(0)
})

test("shows time, depth, temperature and rate where the chart is tapped", async ({
  page,
  request,
}) => {
  await page.goto(`/dive/${await diveId(request, 63)}`)
  const card = profile(page)
  await expect(card.getByText("MOD 33.2 m")).toBeVisible()

  // Halfway along the plot, right of the depth labels' 30 px gutter: the
  // 2502 s axis's 20:51, so the next point, at 21:00.
  const chart = card.locator(".recharts-wrapper").first()
  const box = (await chart.boundingBox())!
  await page.mouse.click(box.x + 30 + (box.width - 30) / 2, box.y + 80)
  await expect(readout(page)).toContainText("at 21:00")
  await expect(readout(page)).toContainText(/\d+\.\dm/)
  await expect(readout(page)).toContainText(/[+−]?\d+\.\d m\/min/)
  await expect(card.getByText(/^\d+(\.\d)? °C$/)).toBeVisible()
})

test("has a table of every point for screen readers", async ({
  page,
  request,
}) => {
  await page.goto(`/dive/${await diveId(request, 63)}`)
  const table = page.getByRole("table", { name: /Every point/ })
  await expect(table).toBeAttached()
  const caption = await table.locator("caption").textContent()
  const count = Number(caption!.match(/(\d+) rows/)![1])
  expect(count).toBeGreaterThan(250)
  await expect(table.locator("tbody tr")).toHaveCount(count)
  await expect(table.getByRole("columnheader")).toHaveText([
    "Time",
    "Depth (m)",
    "Water temperature (°C)",
    "Vertical rate (m/min, ascending positive)",
    "Event",
  ])
})

test("loads the chart's code only on a dive", async ({ page, request }) => {
  const chart: string[] = []
  page.on("request", (req) => {
    if (/\/src\/chart\/profile|recharts/.test(req.url())) chart.push(req.url())
  })
  await page.goto("/")
  await expect(page.locator("main a[href^='/dive/']").first()).toBeVisible()
  // Long enough for the Log's idle preloads to have run.
  await page.waitForTimeout(1000)
  expect(chart).toEqual([])

  await page.goto(`/dive/${await diveId(request, 63)}`)
  await expect(profile(page).locator(".recharts-wrapper").first()).toBeVisible()
  expect(chart).not.toEqual([])
})

test("asks once when the samples fail, then tries again on request", async ({
  page,
  request,
}) => {
  const id = await diveId(request, 61)
  let asked = 0
  await page.route(`**/api/dives/${id}/samples`, (route) => {
    asked++
    return route.fulfill({ status: 503, json: {} })
  })
  await page.goto(`/dive/${id}`)
  const retry = profile(page).getByRole("button", { name: "Try again" })
  await expect(retry).toBeVisible()
  // Rendering the error must not start another request.
  await page.waitForTimeout(500)
  expect(asked).toBe(1)

  await page.unroute(`**/api/dives/${id}/samples`)
  await retry.click()
  await expect(profile(page).locator(".recharts-wrapper").first()).toBeVisible()
})

test("recovers when the chart's code failed to load", async ({
  page,
  request,
}) => {
  const id = await diveId(request, 61)
  const chunk = "**/src/chart/profile.tsx*"
  await page.route(chunk, (route) => route.fulfill({ status: 503, body: "" }))
  await page.goto(`/dive/${id}`)
  const retry = profile(page).getByRole("button", { name: "Try again" })
  await expect(retry).toBeVisible()
  await expect(profile(page).getByRole("status")).toHaveText(
    "The profile couldn't be loaded.Try again"
  )

  await page.unroute(chunk)
  await retry.click()
  await expect(profile(page).locator(".recharts-wrapper").first()).toBeVisible()
})
