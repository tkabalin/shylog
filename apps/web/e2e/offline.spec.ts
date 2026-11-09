import { expect, type Page } from "@playwright/test"

import { deleteDive, diveId, getLog, test } from "./api"
import { still } from "./ui"

const header = (page: Page) => page.locator("header").first()
const profile = (page: Page) =>
  page.locator("section[aria-labelledby=profile-h]")

// How many dives' samples the phone keeps, read straight from IndexedDB.
const keptProfiles = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("shylog")
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          // Before the app has made the table, say so rather than hang.
          try {
            const count = open.result
              .transaction("profiles")
              .objectStore("profiles")
              .count()
            count.onsuccess = () => {
              open.result.close()
              resolve(count.result)
            }
          } catch (error) {
            open.result.close()
            reject(error as Error)
          }
        }
      })
  )

test("opens with no signal from the cache, the Log and a dive with its profile @built", async ({
  page,
  context,
  request,
}) => {
  const id = await diveId(request, 54)
  await page.goto("/")
  await expect(header(page)).toContainText("42dives logged")
  // The worker has taken the page, and every profile is on the phone.
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      // Precaching every chunk is background work, slower on a busy runner.
      timeout: 15_000,
    })
    .toBe(true)
  await expect.poll(() => keptProfiles(page), { timeout: 15_000 }).toBe(42)

  await context.setOffline(true)
  await page.reload()
  // The page the worker kept came from the server, which names it.
  await expect(page).toHaveTitle("Shylog e2e")
  await expect(header(page)).toContainText("42dives logged")
  await expect(
    page.getByRole("link", { name: "Offline. Open sync status" })
  ).toBeVisible()

  // A dive's route, never opened online, loads from the cache too.
  await page.goto(`/dive/${id}`)
  await expect(profile(page).locator(".recharts-surface").first()).toBeVisible()
  await expect(header(page).getByRole("img", { name: "Offline" })).toBeVisible()
})

const sheet = (page: Page) => page.getByRole("dialog")
const cards = (page: Page) => page.locator("main a[href^='/dive/dive-']")
// The tab, which replaces the screen: a detail's own Log link goes back.
const logTab = (page: Page) =>
  page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Log" })
const badge = (page: Page) =>
  page.getByRole("link", { name: /Open sync status$/ })

// Logs a dive at a new site from the form, which must already be open.
async function logDive(page: Page, site: string) {
  await page.getByRole("button", { name: /^Site,/ }).click()
  await still(sheet(page))
  await sheet(page).getByRole("button", { name: "New site" }).click()
  await sheet(page).getByLabel("Name").fill(site)
  await sheet(page).getByRole("button", { name: "Add", exact: true }).click()
  await expect(
    page.getByRole("button", { name: /^Site,/ })
  ).toHaveAccessibleName(`Site, ${site}`)
  await page.locator("#field-time").fill("09:00")
  await page.getByLabel("Duration").fill("40")
  await page.getByLabel("Max depth").fill("12")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page).toHaveURL(/\/dive\/dive-[\w-]+$/)
  return page.url().split("/").pop()!
}

// Opens a dive and comes back, so the detail's code is loaded before the
// network goes: the dev server, unlike a build, has no worker to cache it.
async function warmDetail(page: Page) {
  await page.goto("/")
  await cards(page).first().click()
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await logTab(page).click()
  await expect(header(page)).toContainText("dives logged")
}

test("a dive saved offline waits on the phone with a provisional number, then uploads and gets it @writes", async ({
  // First, so its undo runs once the page has closed: a dive still on its
  // way up would otherwise land after the undo deleted nothing.
  restore,
  page,
  context,
}) => {
  const site = `E2E Offline ${Date.now()}`
  await warmDetail(page)
  // Today's dive comes after every fixture dive, so it will be the last.
  const next = (await cards(page).count()) + 1
  await page.getByRole("link", { name: "Log a dive" }).click()
  await expect(page.getByRole("heading", { name: "New dive" })).toBeVisible()
  await context.setOffline(true)
  const id = await logDive(page, site)
  restore((request) => deleteDive(request, id))

  // The detail says where it is and numbers it provisionally.
  await expect(page.getByText("Saved on this phone")).toBeVisible()
  await expect(page.getByText("Syncs when you’re back online")).toBeVisible()
  await expect(page.getByText(`Dive ${next}, provisional`)).toBeVisible()

  // Its card is outlined, with a cloud-off icon and screen-reader text.
  await logTab(page).click()
  const card = page.locator(`main a[href='/dive/${id}']`)
  await expect(card).toContainText("Not synced")
  await expect(card).toContainText(`${next} (provisional)`)
  await expect(card.locator("svg.tabler-icon-cloud-off")).toBeVisible()
  await expect(badge(page)).toHaveAccessibleName(
    "Offline, 1 dive not synced yet. Open sync status"
  )

  // Back online it uploads at once and takes its number.
  await context.setOffline(false)
  await expect(card).not.toContainText("Not synced")
  await expect(card).not.toContainText("provisional")
  await expect(badge(page)).toHaveCount(0)
  // The server's number, as the card's text holds the site's digits too.
  await expect
    .poll(
      async () =>
        (await getLog(page.request)).dives.find((dive) => dive.id === id)
          ?.number
    )
    .toBe(next)
  await expect(card).toContainText(String(next))
})

test("a synced dive can't be edited or deleted offline, and is marked offline", async ({
  page,
  context,
  request,
}) => {
  await page.goto(`/dive/${await diveId(request, 63)}`)
  const edit = page.getByRole("link", { name: "Edit" })
  await expect(edit).not.toHaveAttribute("aria-disabled")
  const mark = header(page).getByRole("img", { name: "Offline" })
  await expect(mark).toBeHidden()
  await context.setOffline(true)
  await expect(mark).toBeVisible()
  await expect(edit).toHaveAttribute("aria-disabled", "true")
  await expect(page.getByRole("button", { name: "Delete dive" })).toBeDisabled()
  await context.setOffline(false)
  await expect(edit).not.toHaveAttribute("aria-disabled")
  await expect(mark).toBeHidden()
  await expect(page.getByRole("button", { name: "Delete dive" })).toBeEnabled()
})

test("a draft the server refuses is marked on its card and says why on its detail", async ({
  page,
}) => {
  // Refused before it reaches the server, so the log is left alone.
  await page.route("**/api/ops", (route) =>
    route.fulfill({ status: 422, json: { error: "Its site was deleted" } })
  )
  await page.goto("/")
  await page.getByRole("link", { name: "Log a dive" }).click()
  const id = await logDive(page, `E2E Refused ${Date.now()}`)
  await expect(page.getByText("The server refused this dive")).toBeVisible()
  await expect(page.getByText("Its site was deleted")).toBeVisible()
  await logTab(page).click()
  // The card keeps its place line, which the reason was cut short in.
  const card = page.locator(`main a[href='/dive/${id}']`)
  await expect(card.locator("svg.tabler-icon-alert-triangle")).toBeVisible()
  await expect(card).not.toContainText("Its site was deleted")
  await expect(badge(page)).toHaveAccessibleName(
    "Not synced, 1 dive not synced yet. Open sync status"
  )
})

test("the Import screen shows its Offline state and doesn't upload", async ({
  page,
  context,
}) => {
  await page.goto("/import")
  const choose = page.getByText("Choose file", { exact: true })
  await expect(choose).toBeVisible()
  await context.setOffline(true)
  await expect(
    page.getByText("Import needs a connection to the server.")
  ).toBeVisible()
  // Greyed where it was, as the board draws it, and the picker won't open.
  await expect(choose).toBeVisible()
  await expect(page.locator("input[type=file]")).toBeDisabled()
})
