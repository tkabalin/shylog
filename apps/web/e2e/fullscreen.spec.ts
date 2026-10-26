import { devices, expect, type Page } from "@playwright/test"

import { diveId, test } from "./api"

const expand = (page: Page) =>
  page.getByRole("link", { name: "Show the profile full screen" })
// Over the dive, whose own card has a chart and readout too.
const screen = (page: Page) => page.locator("[data-slot=full-profile]")
const readout = (page: Page) => screen(page).locator("[data-slot=readout]")
const chartOf = (page: Page) =>
  screen(page).locator(".recharts-wrapper").first()

test("opens the profile full screen and closes back to the dive", async ({
  page,
  request,
}) => {
  const id = await diveId(request, 54)
  await page.goto(`/dive/${id}`)
  await expand(page).click()
  await expect(page).toHaveURL(`/dive/${id}/profile`)
  await expect(chartOf(page)).toBeVisible()
  await expect(readout(page)).toContainText("42.2m")
  await expect(
    screen(page).getByRole("heading", { level: 1, name: /Sodwana/ })
  ).toBeVisible()
  // The dive underneath is out of reach until it closes.
  expect(
    await page.locator("#root").evaluate((el) => (el as HTMLElement).inert)
  ).toBe(true)

  // Pushed: closing goes back to the dive, and so does the browser's back.
  await page.getByRole("link", { name: "Close" }).click()
  await expect(page).toHaveURL(`/dive/${id}`)
  expect(
    await page.locator("#root").evaluate((el) => (el as HTMLElement).inert)
  ).toBe(false)
  await page.goForward()
  await expect(page).toHaveURL(`/dive/${id}/profile`)
  await page.goBack()
  await expect(page).toHaveURL(`/dive/${id}`)
})

test("closes back to the dive scrolled where it was", async ({
  page,
  request,
}) => {
  await page.goto(`/dive/${await diveId(request, 54)}`)
  await expect(page.locator(".recharts-wrapper").first()).toBeVisible()
  const main = page.locator("#main")
  await main.evaluate((el) => el.scrollTo(0, 200))
  await expand(page).click()
  await expect(readout(page)).toContainText("42.2m")
  await page.getByRole("link", { name: "Close" }).click()
  await expect(expand(page)).toBeVisible()
  expect(await main.evaluate((el) => el.scrollTop)).toBe(200)
})

test("opened directly, closes to the dive in its place", async ({
  page,
  request,
}) => {
  const id = await diveId(request, 54)
  await page.goto("/stats")
  await expect(page.getByRole("heading", { name: "Stats" })).toBeAttached()
  await page.goto(`/dive/${id}/profile`)
  // On WebKit the router's first navigation can still be running and
  // swallow the next one, so wait for the page it renders.
  await expect(chartOf(page)).toBeVisible()
  await page.getByRole("link", { name: "Close" }).click()
  await expect(page).toHaveURL(`/dive/${id}`)
  await page.goBack()
  await expect(page).toHaveURL("/stats")
})

test.describe("on a phone held upright", () => {
  test.use({
    viewport: devices["iPhone 14"].viewport,
    hasTouch: true,
    isMobile: true,
  })

  test("draws the chart a quarter turn round, scrubbed along the screen's height", async ({
    page,
    request,
  }) => {
    const id = await diveId(request, 54)
    await page.goto(`/dive/${id}/profile`)
    const chart = chartOf(page)
    await expect(chart).toBeVisible()
    // The time axis runs down the screen: the chart is taller than wide.
    const box = (await chart.boundingBox())!
    expect(box.height).toBeGreaterThan(box.width)

    // A tap a third of the way down the plot (past the 30 px gutter, now
    // at the top) lands about a third of the way through the dive.
    await page.touchscreen.tap(
      box.x + box.width / 2,
      box.y + 30 + (box.height - 30) / 3
    )
    await expect(readout(page)).toContainText(/at (9|10|11):\d\d/)
  })
})

test.describe("on a phone turned sideways", () => {
  test.use({
    viewport: devices["iPhone 14 landscape"].viewport,
    hasTouch: true,
    isMobile: true,
  })

  test("draws the chart upright across the screen", async ({
    page,
    request,
  }) => {
    await page.goto(`/dive/${await diveId(request, 54)}/profile`)
    const chart = chartOf(page)
    await expect(chart).toBeVisible()
    const box = (await chart.boundingBox())!
    expect(box.width).toBeGreaterThan(box.height)
  })
})
