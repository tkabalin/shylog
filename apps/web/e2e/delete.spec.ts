import { expect, type Page } from "@playwright/test"

import { longDate } from "../src/format/dates"
import { deleteDive, diveId, getLog, restoreDive, test } from "./api"
import { still } from "./ui"

const sheet = (page: Page) => page.getByRole("alertdialog")

// How Recently deleted names a dive's card, so a test finds its own among
// dives other specs left there (their undo deletes, which keeps them).
async function cardName(page: Page, id: string) {
  const log = await getLog(page.request)
  const dive = log.dives.find((one) => one.id === id)!
  const site = log.sites.find((one) => one.id === dive.siteId)!.name
  return `${site}, ${longDate(dive.startTime)}`
}

test("deletes a synced dive, finds it in Recently deleted and restores it @writes", async ({
  page,
  restore,
}) => {
  const id = await diveId(page.request, 63)
  restore((request) => restoreDive(request, id))
  const number = (await getLog(page.request)).dives.find(
    (dive) => dive.id === id
  )!.number
  const name = await cardName(page, id)

  // From the Log, so deleting goes back to it.
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Log" })).toBeAttached()
  await page.goto(`/dive/${id}`)
  await page.getByRole("button", { name: "Delete dive" }).click()
  await still(sheet(page))
  await expect(sheet(page)).toContainText(
    "You can restore it from Recently deleted"
  )
  await sheet(page).getByRole("button", { name: "Delete dive" }).click()
  await expect(page).toHaveURL(/\/$/)
  expect(
    (await getLog(page.request)).dives.find((dive) => dive.id === id)?.deletedAt
  ).toBeTruthy()

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "You" })
    .click()
  await page.getByRole("link", { name: /^Recently deleted/ }).click()
  const today = page.getByRole("region", { name: "Deleted today" })
  await today.getByRole("link", { name: `${name}. Open`, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/dive/${id}$`))
  await expect(page.getByText("Not in your log, stats or export")).toBeVisible()
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0)

  await page.getByRole("button", { name: "Restore" }).click()
  await expect(page.getByText(/is back in your log$/)).toBeVisible()
  await expect(page.getByText(`Dive ${number}`, { exact: true })).toBeVisible()
  await expect(page.getByText("Not in your log, stats or export")).toHaveCount(
    0
  )
  // Back returns to Recently deleted, now without the dive.
  await page.getByRole("link", { name: "Deleted", exact: true }).click()
  await expect(page).toHaveURL(/\/you\/deleted$/)
  await expect(
    page.getByRole("link", { name: `${name}. Open`, exact: true })
  ).toHaveCount(0)
})

test("restores from the list with a toast that opens the dive @writes", async ({
  page,
  restore,
}) => {
  const id = await diveId(page.request, 61)
  restore((request) => restoreDive(request, id))
  await deleteDive(page.request, id)
  const name = await cardName(page, id)

  await page.goto("/you")
  await page.getByRole("link", { name: /^Recently deleted/ }).click()
  await page
    .getByRole("button", { name: `Restore ${name}`, exact: true })
    .click()
  const toast = page.getByText(/is back in your log$/)
  await expect(toast).toBeVisible()
  // At once, before the toast times out on a slow runner.
  await page.getByRole("button", { name: "View", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/dive/${id}$`))
  // The dive was pushed over Recently deleted, which its Back link names.
  await expect(
    page.getByRole("link", { name: "Deleted", exact: true })
  ).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/you\/deleted$/)
  // Its card folded away.
  await expect(
    page.getByText(/^(Nothing deleted|Deleted dives still stop)/)
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: `Restore ${name}`, exact: true })
  ).toHaveCount(0)
})

test("deletes from the edit form, back past the detail to the Log @writes", async ({
  page,
  restore,
}) => {
  const id = await diveId(page.request, 54)
  restore((request) => restoreDive(request, id))
  await page.goto("/")
  await page.locator(`main a[href='/dive/${id}']`).click()
  await page.getByRole("link", { name: "Edit" }).click()
  await expect(page.getByRole("heading", { name: "Edit dive" })).toBeVisible()
  await page.getByRole("button", { name: "Delete dive" }).click()
  await still(sheet(page))
  await sheet(page).getByRole("button", { name: "Delete dive" }).click()
  // The Log the dive was opened from, not the deleted dive's page.
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("heading", { name: "Log" })).toBeAttached()
  expect(
    (await getLog(page.request)).dives.find((dive) => dive.id === id)?.deletedAt
  ).toBeTruthy()
})

test("deletes a draft for good, with the draft wording", async ({ page }) => {
  // The draft never reaches the server, so it stays on the phone.
  await page.route("**/api/ops", (route) => route.abort())
  await page.goto("/")
  await page.getByRole("link", { name: "Log a dive" }).click()
  await page.getByRole("button", { name: /^Site,/ }).click()
  const picker = page.getByRole("dialog")
  await still(picker)
  await picker.getByRole("button", { name: "New site" }).click()
  await picker.getByLabel("Name").fill("Draft Reef")
  await picker.getByRole("button", { name: "Add", exact: true }).click()
  await page.locator("#field-time").fill("09:00")
  await page.getByLabel("Duration").fill("40")
  await page.getByLabel("Max depth").fill("12")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page).toHaveURL(/\/dive\/dive-[\w-]+$/)

  await page.getByRole("button", { name: "Delete dive" }).click()
  await still(sheet(page))
  await expect(sheet(page)).toContainText("It won’t go to Recently deleted")
  await sheet(page).getByRole("button", { name: "Delete for good" }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText("Draft Reef")).toHaveCount(0)
  // It never reached the server, so Recently deleted doesn't have it.
  await page.goto("/you/deleted")
  await expect(
    page.getByText(/^(Nothing deleted|Deleted dives still stop)/)
  ).toBeVisible()
  await expect(page.getByText("Draft Reef")).toHaveCount(0)
})
