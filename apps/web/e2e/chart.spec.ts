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

  // The alarms' five bands, each with its icon and no text: the list
  // names them.
  await expect(
    card.locator(".recharts-reference-area:not(.stop-band)")
  ).toHaveCount(5)
  await expect(card.locator("svg g.text-warn")).toHaveCount(5)
  await expect(card.locator("svg text", { hasText: "Ascent" })).toHaveCount(0)

  // The five alarms, then the safety stop.
  const events = card.getByRole("region", { name: "Events" })
  const rows = events.getByRole("button")
  await expect(rows).toHaveCount(6)
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

test("lists dive 54's safety stop, marks it and moves the crosshair to it", async ({
  page,
  request,
}) => {
  await page.goto(`/dive/${await diveId(request, 54)}`)
  const card = profile(page)
  const events = card.getByRole("region", { name: "Events" })
  await expect(events.getByText("6", { exact: true })).toBeVisible()
  const stop = events.getByRole("button", { name: /^Safety stop/ })
  await expect(stop).toHaveAccessibleName(
    "Safety stop from 19:32, held 9 minutes 39 seconds at an average of 5.5 metres. Show on profile."
  )
  await expect(stop).toContainText("at an average of 5.5 m from 19:32")
  await expect(stop).toContainText("9:39")
  // Marked by its icon and a band of its own beside the alarms' five.
  await expect(card.locator("svg g.text-ok")).toHaveCount(1)
  await expect(card.locator(".stop-band")).toHaveCount(1)
  await expect(card.locator(".recharts-reference-area")).toHaveCount(6)

  // On the first chart point in the band, 8 s after the stop's start.
  await stop.click()
  await expect(readout(page)).toContainText("at 19:40")
  await expect(readout(page)).toContainText("Safety stop")
  await expect(
    page.getByRole("row").filter({ hasText: "Safety stop" }).first()
  ).toContainText("19:40")
})

test("has no Events section on a dive with no alarm or stop", async ({
  page,
  request,
}) => {
  await page.goto(`/dive/${await diveId(request, 66)}`)
  const card = profile(page)
  // Drawn first, so the checks below can't pass before the chart is in.
  await expect(card.locator(".recharts-wrapper").first()).toBeVisible()
  await expect(card.getByRole("region", { name: "Events" })).toHaveCount(0)
  await expect(card.locator("svg g.text-ok")).toHaveCount(0)
  await expect(card.locator(".stop-band")).toHaveCount(0)
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

test("smooths the water temperature, and its caption picks the recorded line", async ({
  page,
  request,
}) => {
  await page.goto(`/dive/${await diveId(request, 36)}`)
  const card = profile(page)
  const caption = card.getByRole("button", { name: /^Water temperature/ })
  const labels = card.locator("svg text", { hasText: /°$/ })
  // The water was 17 °C throughout, so one label.
  await expect(caption).toHaveText("Water temperature · Smoothed")
  await expect(labels).toHaveText(["17°"])

  await caption.click()
  const menu = card.getByRole("group", { name: "Water temperature line" })
  await expect(menu.getByRole("button", { name: /^Smoothed/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await menu.getByRole("button", { name: /^Recorded/ }).click()
  await expect(caption).toHaveText("Water temperature · Recorded")
  await expect(caption).toHaveAttribute("aria-expanded", "false")
  // The computer read 20 °C on the way down.
  await expect(labels).toHaveText(["17°", "20°"])
  await expect(page.getByRole("table", { name: /as recorded/ })).toBeAttached()

  // Kept on the phone.
  await page.reload()
  await expect(caption).toHaveText("Water temperature · Recorded")
})

test("closes the caption's menu on a tap outside it", async ({
  page,
  request,
}) => {
  await page.goto(`/dive/${await diveId(request, 36)}`)
  const card = profile(page)
  const caption = card.getByRole("button", { name: /^Water temperature/ })
  await caption.click()
  await expect(caption).toHaveAttribute("aria-expanded", "true")
  // On the chart: the tap closes the menu and leaves the crosshair be.
  const at = await readout(page).textContent()
  const chart = card.locator(".recharts-wrapper").first()
  const box = (await chart.boundingBox())!
  await page.mouse.click(box.x + box.width - 20, box.y + 40)
  await expect(caption).toHaveAttribute("aria-expanded", "false")
  await expect(readout(page)).toHaveText(at!)
  await expect(caption).toHaveText("Water temperature · Smoothed")
})

test("picks the temperature line from the keyboard", async ({
  page,
  request,
}) => {
  await page.goto(`/dive/${await diveId(request, 36)}`)
  const card = profile(page)
  const caption = card.getByRole("button", { name: /^Water temperature/ })
  await caption.focus()
  await page.keyboard.press("Enter")
  const menu = card.getByRole("group", { name: "Water temperature line" })
  await expect(menu.getByRole("button", { name: /^Smoothed/ })).toBeFocused()
  await page.keyboard.press("ArrowDown")
  await expect(menu.getByRole("button", { name: /^Recorded/ })).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(caption).toHaveText("Water temperature · Recorded")
  await expect(caption).toBeFocused()
})

test("moves the crosshair with a pointer over the time labels", async ({
  page,
  request,
}) => {
  await page.goto(`/dive/${await diveId(request, 63)}`)
  const card = profile(page)
  await expect(card.getByText("MOD 33.2 m")).toBeVisible()
  // Halfway along, as the tap above, but on the time labels' row.
  const chart = card.locator(".recharts-wrapper").first()
  const box = (await chart.boundingBox())!
  await page.mouse.move(
    box.x + 30 + (box.width - 30) / 2,
    box.y + box.height - 8
  )
  await expect(readout(page)).toContainText("at 21:00")
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

test("loads the chart's code once the Log is idle", async ({ page }) => {
  const chart: string[] = []
  page.on("request", (req) => {
    if (/\/src\/chart\/profile|recharts/.test(req.url())) chart.push(req.url())
  })
  await page.goto("/")
  await expect(
    page.locator("main a[href^='/dive/dive-']").first()
  ).toBeVisible()
  // Before any dive is opened, so the first one needn't wait on it.
  await expect.poll(() => chart.length).toBeGreaterThan(0)
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
  // The background download fails the same way.
  await page.route("**/api/samples?*", (route) =>
    route.fulfill({ status: 503, json: {} })
  )
  await page.goto(`/dive/${id}`)
  const retry = profile(page).getByRole("button", { name: "Try again" })
  await expect(retry).toBeVisible()
  // Rendering the error must not start another request.
  await page.waitForTimeout(500)
  expect(asked).toBe(1)

  await page.unroute(`**/api/dives/${id}/samples`)
  await page.unroute("**/api/samples?*")
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
