import { expect, test } from "@playwright/test"

// A tour of the Log, a dive's detail and the You tab's screens that fails on
// anything the browser reports: console warnings and errors, uncaught
// exceptions, error responses.
test("leaves the console clean", async ({ page }) => {
  const seen: string[] = []
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type())) {
      seen.push(`${message.type()}: ${message.text()}`)
    }
  })
  page.on("pageerror", (error) => seen.push(`exception: ${error.message}`))
  page.on("response", (response) => {
    if (response.status() >= 400) {
      seen.push(`${response.status()}: ${response.url()}`)
    }
  })

  await page.goto("/")
  await expect(
    page.locator("main a[href^='/dive/dive-']").first()
  ).toBeVisible()
  await page.getByRole("combobox", { name: /^Year/ }).click()
  await page.getByRole("option", { name: "2026" }).click()
  await page.getByRole("button", { name: "Depth" }).click()
  await expect(page.getByRole("dialog", { name: "Depth" })).toBeVisible()
  await page.keyboard.press("Escape")
  await page.getByRole("searchbox", { name: "Search dives" }).fill("Sodwana")
  await page.locator("#main").evaluate((el) => el.scrollBy(0, 600))
  await page.locator("main a[href^='/dive/dive-']").first().click()
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.locator("#main").evaluate((el) => el.scrollBy(0, 600))
  await page.goBack()
  await expect(
    page.locator("main a[href^='/dive/dive-']").first()
  ).toBeVisible()
  await page.goto("/dive/dive-missing")
  await expect(page.getByText("Dive not found")).toBeVisible()

  await page.goto("/you")
  await expect(
    page.getByRole("heading", { name: "You", exact: true })
  ).toBeVisible()
  await page.getByRole("link", { name: /^Sites/ }).click()
  await page.locator("main a[href^='/you/entities/site/']").first().click()
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page
    .getByRole("button", { name: "Merge a duplicate into this" })
    .click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Escape")
  await page.goto("/you/entities?kind=person")
  await page.goto("/you/deleted")
  await expect(
    page.getByText(/^(Nothing deleted|Deleted dives still stop)/)
  ).toBeVisible()

  expect(seen).toEqual([])
})
