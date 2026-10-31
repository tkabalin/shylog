import { expect, type APIRequestContext, type Page } from "@playwright/test"

import { diveId, getLog, patchDive, putSettings, test } from "./api"

// The settings as they were, put back once the test ends.
async function keepSettings(
  page: Page,
  restore: (undo: (request: APIRequestContext) => Promise<void>) => void
) {
  const { settings } = await getLog(page.request)
  restore((request) => putSettings(request, settings))
  return settings
}

const row = (page: Page, label: string) =>
  page.locator("div", { has: page.getByText(label, { exact: true }) }).last()

const settings = async (page: Page) => (await getLog(page.request)).settings

// The settings in the phone's copy of the log, which a new dive is filled
// from: the server can hold a save before the sync after it lands here.
const mirrored = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const open = indexedDB.open("shylog")
        open.onupgradeneeded = () => open.transaction!.abort()
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const get = db.transaction("meta").objectStore("meta").get("log")
          get.onerror = () => reject(get.error)
          get.onsuccess = () => resolve(get.result?.settings)
          get.transaction!.oncomplete = () => db.close()
        }
      })
  )

test("saves the diver name and maximum PO₂ as their field is left @writes", async ({
  page,
  restore,
}) => {
  await keepSettings(page, restore)
  await page.goto("/you")

  // Return leaves the field, as on the phone's keyboard.
  await page.getByLabel("Diver name").fill("E2E Diver")
  await page.getByLabel("Diver name").press("Enter")
  await expect
    .poll(async () => (await settings(page)).diverName)
    .toBe("E2E Diver")

  await page.getByLabel("Maximum PO₂").fill("1,5")
  await page.getByLabel("Maximum PO₂").blur()
  await expect.poll(async () => (await settings(page)).maxPo2).toBe(1.5)
  // Shown as saved once the page reloads from the server's copy.
  await page.reload()
  await expect(page.getByLabel("Diver name")).toHaveValue("E2E Diver")
  await expect(page.getByLabel("Maximum PO₂")).toHaveValue("1.5")
})

// Tagged, so a regression that saved 2.5 can't break every MOD on the
// read-only stack, and the settings come back either way.
test("shows a refused value under its field and keeps it @writes", async ({
  page,
  restore,
}) => {
  const { maxPo2 } = await keepSettings(page, restore)
  await page.goto("/you")
  await page.getByLabel("Maximum PO₂").fill("2.5")
  await page.getByLabel("Maximum PO₂").blur()
  await expect(
    page.getByText("From 1.0 to 2.0 bar, in steps of 0.1")
  ).toBeVisible()
  await expect(page.getByLabel("Maximum PO₂")).toHaveValue("2.5")
  expect((await settings(page)).maxPo2).toBe(maxPo2)
})

test("puts the saved value back when a save fails @writes", async ({
  page,
  restore,
}) => {
  const { diverName } = await keepSettings(page, restore)
  await page.goto("/you")
  await page.route("**/api/settings", (route) =>
    route.request().method() === "PUT" ? route.abort() : route.fallback()
  )
  await page.getByLabel("Diver name").fill("E2E Unsaved")
  await page.getByLabel("Diver name").blur()
  await expect(page.getByRole("alert")).toBeVisible()
  await expect(page.getByLabel("Diver name")).toHaveValue(diverName)
  expect((await settings(page)).diverName).toBe(diverName)
})

test("sets new-dive defaults in the form's controls, which fill a new dive @writes", async ({
  page,
  restore,
}) => {
  await keepSettings(page, restore)
  await page.goto("/you")
  // A tap saves at once.
  await page.getByRole("button", { name: "Steel" }).click()
  await expect
    .poll(async () => (await settings(page)).newDiveDefaults.cylinderMaterial)
    .toBe("steel")
  await page.getByLabel("Volume").fill("12")
  // Nitrox waits for its oxygen rather than calling it missing.
  await page.getByLabel("Nitrox").check()
  await expect(page.getByText("Required for nitrox")).toHaveCount(0)
  await page.getByLabel("Oxygen").fill("32")
  await page.getByLabel("Weight").fill("6")
  await page.getByLabel("Weight").blur()
  await expect
    .poll(async () => (await settings(page)).newDiveDefaults)
    .toMatchObject({
      cylinderMaterial: "steel",
      cylinderVolume: 12_000,
      nitrox: true,
      oxygen: 320,
      weight: 6,
    })
  // Leaving sooner cuts that sync off, and the form opens on the old ones.
  await expect
    .poll(() => mirrored(page))
    .toMatchObject({ newDiveDefaults: { weight: 6 } })

  await page.goto("/dive/new")
  await expect(page.getByRole("button", { name: "Steel" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await expect(page.getByLabel("Volume")).toHaveValue("12")
  await expect(page.getByLabel("Nitrox")).toBeChecked()
  await expect(page.getByLabel("Oxygen")).toHaveValue("32")
  await expect(page.getByLabel("Weight")).toHaveValue("6")
})

test("applies the appearance at once and keeps it", async ({ page }) => {
  await page.goto("/you")
  const html = page.locator("html")
  await page.getByRole("button", { name: "Dark" }).click()
  await expect(html).toHaveClass(/\bdark\b/)
  await page.getByRole("button", { name: "Light" }).click()
  await expect(html).toHaveClass(/\blight\b/)
  await page.reload()
  await expect(html).toHaveClass(/\blight\b/)
  await expect(page.getByRole("button", { name: "Light" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
})

test("shows the version and the server's name", async ({ page }) => {
  await page.goto("/you")
  // The commit a build was made from, or "dev" off one.
  await expect(row(page, "Version")).toContainText(/(dev|[0-9a-f]{7})$/)
  const health = (await (
    await page.request.get("/api/health", { headers: { "X-Shylog": "1" } })
  ).json()) as { server: string }
  await expect(row(page, "Server")).toContainText(health.server)
})

test("never marks the back link as the current page", async ({ page }) => {
  await page.goto("/you/entities?kind=site")
  // The bar's, not the tab bar's, which is current here.
  const back = page
    .locator("header")
    .getByRole("link", { name: "You", exact: true })
  await expect(back).toBeVisible()
  await expect(back).not.toHaveAttribute("aria-current", "page")
})

test("counts ignored dives in Your log @writes", async ({ page, restore }) => {
  const id = await diveId(page.request, 63)
  restore((request) => patchDive(request, id, { ignored: false }))
  await patchDive(page.request, id, { ignored: true })
  const total = (await getLog(page.request)).dives.filter(
    (dive) => !dive.deletedAt
  ).length
  await page.goto("/you")
  // The server's count, once /api/health has answered: the backup times
  // come with it.
  await expect(row(page, "Last backup")).not.toContainText("—")
  await expect(row(page, "Dives")).toContainText(new RegExp(`\\D${total}$`))
})

// A sync runs whenever the app comes back to the foreground. One still
// running takes the call over, so it is repeated until `status` shows.
const foreground = (page: Page, status: string) =>
  expect(async () => {
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange"))
    )
    await expect(page.getByRole("status")).toHaveText(status, {
      timeout: 1000,
    })
  }).toPass()

test("says when the server can't be reached, keeping the last sync", async ({
  page,
}) => {
  await page.goto("/you")
  await expect(page.getByRole("status")).toHaveText("All synced")
  await expect(page.getByText("Last sync just now")).toBeVisible()

  await page.route("**/api/log", (route) => route.abort())
  await foreground(page, "Can’t reach the server")
  await expect(page.getByText("Last sync just now")).toBeVisible()

  await page.unroute("**/api/log")
  await foreground(page, "All synced")
})

test("says when the server can't be reached before the first sync", async ({
  page,
}) => {
  await page.route("**/api/log", (route) => route.abort())
  await page.goto("/you")
  await expect(page.getByRole("status")).toHaveText("Can’t reach the server")
  await expect(page.getByText("No sync yet")).toBeVisible()
  // A later sync may still be asking as the test ends.
  await page.unrouteAll({ behavior: "ignoreErrors" })
})

test("warns that saving is paused after a failed database check", async ({
  page,
}) => {
  await page.route("**/api/health", async (route) => {
    const res = await route.fetch()
    await route.fulfill({
      response: res,
      json: { ...(await res.json()), writesPaused: true },
    })
  })
  await page.goto("/you")
  await expect(page.getByRole("alert")).toContainText("Saving is paused")
  // A later sync may still be asking as the test ends.
  await page.unrouteAll({ behavior: "ignoreErrors" })
})
