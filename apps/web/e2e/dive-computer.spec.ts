import { expect } from "@playwright/test"

import { deleteDive, getLog, test } from "./api"

// The stack's dctool is a stand-in playing back the D4i's raw fixtures,
// moved a further ten years on from 2126 with each download, so every run
// finds new dives clear of the seeded log.

test("downloads from the dive computer through the review @writes", async ({
  page,
  restore,
}) => {
  test.slow()
  const origin = new URL(test.info().project.use.baseURL!).origin
  const headers = { "X-Shylog": "1", Origin: origin }
  // Starts with no remembered watch, and leaves none, nor its dives.
  const forget = () => page.request.delete("/api/dive-computer", { headers })
  await forget()
  restore(async (request) => {
    await request.delete("/api/dive-computer", { headers })
    for (const dive of (await getLog(request)).dives)
      if (!dive.deletedAt && dive.startTime >= "2100")
        await deleteDive(request, dive.id)
  })

  await page.goto("/")
  // Leaving a screen while its code still loads makes WebKit reload it,
  // so each step waits for the screen it lands on.
  await expect(page.getByRole("heading", { name: "Log" })).toBeAttached()
  await page.goto("/import")
  await page.getByRole("button", { name: "Detect dive computer" }).click()
  await expect(page.getByText("Suunto D4i", { exact: true })).toBeVisible()
  await expect(page.getByText("Not downloaded yet")).toBeVisible()
  // The new preview's waiting card never flashes before the review opens.
  await page.evaluate(() => {
    new MutationObserver(() => {
      if (document.body.textContent?.includes("Import waiting for review"))
        document.body.dataset.flashed = ""
    }).observe(document.body, { childList: true, subtree: true })
  })
  await page.getByRole("button", { name: "Download dives" }).click()

  await expect(page).toHaveURL(/\/import\/review$/)
  await expect(page.locator("body")).not.toHaveAttribute("data-flashed")
  const importDives = page.getByRole("button", { name: /^Import \d+ dives$/ })
  await expect(importDives).toBeVisible()
  // The review replaced Import, as an upload's does, so back leaves both.
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("heading", { name: "Log" })).toBeAttached()
  await page.goto("/import")
  await page.getByRole("link", { name: /Import waiting for review/ }).click()
  await importDives.click()
  await expect(page).toHaveURL(/\/import\/done$/)
  await expect(
    page.getByRole("heading", { name: "Import complete" })
  ).toBeAttached()

  // The watch is remembered now, with when it was last downloaded.
  await page.goto("/import")
  await expect(page.getByText("Download from your D4i")).toBeVisible()
  await page.getByRole("button", { name: "Detect dive computer" }).click()
  await expect(page.getByText(/^Last downloaded /)).toBeVisible()
  await page.goto("/you")
  await expect(page.getByText(/^Last downloaded /)).toBeVisible()
  await page.getByRole("button", { name: /Suunto D4i/ }).click()
  await page.getByRole("button", { name: "Forget", exact: true }).click()
  await expect(page.getByText("Suunto D4i")).toHaveCount(0)
})
