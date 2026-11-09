import { expect, type BrowserContext, type Page } from "@playwright/test"

import { deleteDive, getLog, test } from "./api"
import { still } from "./ui"

const sheet = (page: Page) => page.getByRole("dialog")
const cards = (page: Page) => page.locator("main a[href^='/dive/dive-']")

// Logs a dive today at `time`, at a site the phone makes itself (or picks,
// once it has one by that name), from the form, which must be open.
async function logDive(page: Page, site: string, time: string) {
  await page.getByRole("button", { name: /^Site,/ }).click()
  await still(sheet(page))
  await sheet(page).getByRole("button", { name: "New site" }).click()
  await sheet(page).getByLabel("Name").fill(site)
  await sheet(page).getByRole("button", { name: "Add", exact: true }).click()
  await expect(
    page.getByRole("button", { name: /^Site,/ })
  ).toHaveAccessibleName(`Site, ${site}`)
  await page.locator("#field-time").fill(time)
  await page.getByLabel("Duration").fill("40")
  await page.getByLabel("Max depth").fill("12")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page).toHaveURL(/\/dive\/dive-[\w-]+$/)
  return page.url().split("/").pop()!
}

// The phone shows the server's number on the dive's detail, once its copy
// has caught up.
async function showsNumber(page: Page, id: string, number: number) {
  await page.goto(`/dive/${id}`)
  await expect(page.getByText(/^Dive \d+$/)).toHaveText(`Dive ${number}`)
}

// Two phones each log a dive offline at a site they both make, then come
// back online one after the other. The server matches the sites, numbers
// the dives by time, and both phones end with the same log.
test("two phones log offline, reconnect in turn, and agree @writes", async ({
  restore,
  browser,
  context: first,
}) => {
  // The same device as the first phone, as the project sets it up.
  const {
    baseURL,
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
  } = test.info().project.use
  const second: BrowserContext = await browser.newContext({
    baseURL,
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
  })
  // Closed however the test ends, as only the first is Playwright's.
  restore(() => second.close())
  const phones = [await first.newPage(), await second.newPage()] as const
  const site = `E2E Sync ${Date.now()}`
  const before = await getLog(phones[0].request)
  const next =
    before.dives.filter((dive) => !dive.deletedAt && !dive.ignored).length + 1

  // Each opens a dive and then the form online, so their code is loaded
  // (the dev server has no worker), then loses the signal.
  for (const page of phones) {
    await page.goto("/")
    await cards(page).first().click()
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await page.goBack()
    await page.getByRole("link", { name: "Log a dive" }).click()
    await expect(page.getByRole("heading", { name: "New dive" })).toBeVisible()
  }
  await first.setOffline(true)
  await second.setOffline(true)
  // The second phone's dive is earlier, so it takes the first one's number.
  const late = await logDive(phones[0], site, "10:00")
  restore((request) => deleteDive(request, late))
  const early = await logDive(phones[1], site, "09:00")
  restore((request) => deleteDive(request, early))
  // Neither knows of the other, so both say the same provisional number.
  for (const page of phones)
    await expect(page.getByText(`Dive ${next}, provisional`)).toBeVisible()

  // Back in turn, each upload waits until the last has landed.
  await first.setOffline(false)
  await expect(
    phones[0].getByText(`Dive ${next}`, { exact: true })
  ).toBeVisible()
  await second.setOffline(false)
  await expect(
    phones[1].getByText(`Dive ${next}`, { exact: true })
  ).toBeVisible()

  const log = await getLog(phones[0].request)
  expect(log.sites.filter((one) => one.name === site)).toHaveLength(1)
  const numbers = (id: string) =>
    log.dives.find((dive) => dive.id === id)?.number
  expect([numbers(early), numbers(late)]).toEqual([next, next + 1])

  // Both phones show the server's numbers and the one site.
  for (const page of phones) {
    await showsNumber(page, early, next)
    await showsNumber(page, late, next + 1)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(site)
  }
})
