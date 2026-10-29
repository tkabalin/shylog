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

// Each section's Save line stays mounted, folded away, until it changes.
const visible = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true }).locator("visible=true")

const row = (page: Page, label: string) =>
  page.locator("div", { has: page.getByText(label, { exact: true }) }).last()

test("saves the diver name and maximum PO₂ with Save @writes", async ({
  page,
  restore,
}) => {
  await keepSettings(page, restore)
  await page.goto("/you")
  const save = visible(page, "Save")
  await expect(save).toHaveCount(0)

  await page.getByLabel("Diver name").fill("E2E Diver")
  await save.click()
  await expect(save).toHaveCount(0)
  expect((await getLog(page.request)).settings.diverName).toBe("E2E Diver")

  await page.getByLabel("Maximum PO₂").fill("1,5")
  await save.click()
  await expect(save).toHaveCount(0)
  expect((await getLog(page.request)).settings.maxPo2).toBe(1.5)
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
  await visible(page, "Save").click()
  await expect(
    page.getByText("From 1.0 to 2.0 bar, in steps of 0.1")
  ).toBeVisible()
  await expect(page.getByLabel("Maximum PO₂")).toHaveValue("2.5")
  await visible(page, "Cancel").click()
  await expect(page.getByLabel("Maximum PO₂")).toHaveValue(maxPo2.toFixed(1))
})

test("sets new-dive defaults in the form's controls, which fill a new dive @writes", async ({
  page,
  restore,
}) => {
  await keepSettings(page, restore)
  await page.goto("/you")
  await page.getByRole("button", { name: "Steel" }).click()
  await page.getByLabel("Volume").fill("12")
  await page.getByLabel("Nitrox").check()
  await page.getByLabel("Oxygen").fill("32")
  await page.getByLabel("Weight").fill("6")
  await visible(page, "Save").click()
  await expect(visible(page, "Save")).toHaveCount(0)
  expect((await getLog(page.request)).settings.newDiveDefaults).toMatchObject({
    cylinderMaterial: "steel",
    cylinderVolume: 12_000,
    nitrox: true,
    oxygen: 320,
    weight: 6,
  })

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
