import { expect, type Page } from "@playwright/test"

import { deleteDive, diveId, getLog, patchDive, test } from "./api"
import { still } from "./ui"

const sheet = (page: Page) => page.getByRole("dialog")

// Opens a picker row and waits for its sheet to finish sliding in.
async function openSheet(page: Page, row: RegExp) {
  await page.getByRole("button", { name: row }).click()
  await still(sheet(page))
}

test("adds a dive with a new site and buddy, which uploads and gets its number @writes", async ({
  page,
  restore,
}) => {
  const name = `E2E Reef ${Date.now()}`
  await page.goto("/")
  await page.getByRole("link", { name: "Log a dive" }).click()
  await expect(page.getByRole("heading", { name: "New dive" })).toBeVisible()

  await openSheet(page, /^Site,/)
  await sheet(page).getByRole("button", { name: "New site" }).click()
  await sheet(page).getByLabel("Name").fill(name)
  await sheet(page).getByRole("button", { name: "Add", exact: true }).click()
  await expect(
    page.getByRole("button", { name: /^Site,/ })
  ).toHaveAccessibleName(`Site, ${name}`)

  await page.locator("#field-time").fill("09:00")
  await page.getByLabel("Duration").fill("40")
  await page.getByLabel("Max depth").fill("18,5")

  await openSheet(page, /^Buddies,/)
  await page.getByRole("textbox", { name: "Buddies" }).fill("E2E Buddy")
  await sheet(page).getByRole("button", { name: "Add “E2E Buddy”" }).click()
  await sheet(page).getByRole("button", { name: "Done" }).click()
  await expect(
    page.getByRole("button", { name: /^Buddies,/ })
  ).toHaveAccessibleName("Buddies, E2E Buddy")

  await page.getByRole("button", { name: "Save", exact: true }).click()
  // The detail takes the form's place.
  await expect(page).toHaveURL(/\/dive\/dive-[\w-]+$/)
  const id = page.url().split("/").pop()!
  restore((request) => deleteDive(request, id))
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name)
  // Bubbles celebrate the save, and it's numbered once the server has it.
  const bubbles = page.locator("body > .fixed[aria-hidden=true]")
  // Bubbles start a frame after the dive shows and clear once they've
  // risen, so none is counted once, two frames on, never awaited.
  const frames = () =>
    page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done))
        )
    )
  await expect(bubbles).toHaveCount(1)
  const number = page.getByText(/^Dive \d+$/)
  await expect(number).toBeVisible()
  // A reload isn't a save, so it plays nothing.
  await page.reload()
  await expect(number).toBeVisible()
  await frames()
  expect(await bubbles.count()).toBe(0)
  await expect(page.getByText("E2E Buddy")).toBeVisible()
  const log = await getLog(page.request)
  expect(log.dives.find((dive) => dive.id === id)?.maxDepth).toBe(18.5)

  // The detail replaced the form, so its Log link goes back to the Log the
  // form was opened from rather than stacking another: forward returns.
  await page.getByRole("link", { name: "Log" }).first().click()
  await expect(page).toHaveURL(/\/$/)
  await page.goForward()
  await expect(page).toHaveURL(new RegExp(`/dive/${id}$`))
  // The save celebrates once: back on the dive, nothing plays.
  await expect(number).toBeVisible()
  await frames()
  expect(await bubbles.count()).toBe(0)
})

test("uploads a dive saved offline once the server answers again @writes", async ({
  page,
  restore,
}) => {
  const name = `E2E Offline Reef ${Date.now()}`
  await page.route("**/api/ops", (route) => route.abort())
  await page.goto("/")
  await page.getByRole("link", { name: "Log a dive" }).click()
  await openSheet(page, /^Site,/)
  await sheet(page).getByRole("button", { name: "New site" }).click()
  await sheet(page).getByLabel("Name").fill(name)
  await sheet(page).getByRole("button", { name: "Add", exact: true }).click()
  await page.locator("#field-time").fill("09:00")
  await page.getByLabel("Duration").fill("40")
  await page.getByLabel("Max depth").fill("12")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page).toHaveURL(/\/dive\/dive-[\w-]+$/)
  const id = page.url().split("/").pop()!
  restore((request) => deleteDive(request, id))
  const number = page.getByText(/^Dive \d+$/)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name)
  await expect(number).toHaveCount(0)

  // The next sync, as the app comes back to the foreground, sends it. A
  // sync still running takes the call over, so it is repeated.
  await page.unroute("**/api/ops")
  await expect(async () => {
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange"))
    )
    await expect(number).toBeVisible({ timeout: 1000 })
  }).toPass()
  const log = await getLog(page.request)
  expect(log.dives.find((dive) => dive.id === id)?.maxDepth).toBe(12)
})

test("edits a dive's notes, which changes the log's version @writes", async ({
  page,
  restore,
}) => {
  const id = await diveId(page.request, 63)
  const before = await getLog(page.request)
  const notes = before.dives.find((dive) => dive.id === id)!.notes
  restore((request) => patchDive(request, id, { notes }))

  // The Log first, so Back from the detail has it to return to.
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Log" })).toBeAttached()
  await page.goto(`/dive/${id}`)
  await page.getByRole("link", { name: "Edit" }).click()
  await expect(page.getByRole("heading", { name: "Edit dive" })).toBeVisible()
  await page.getByLabel("General").fill("Strong drift north")
  await page.getByRole("button", { name: "Save", exact: true }).click()

  // Save goes back to the detail, which shows the new notes.
  await expect(page).toHaveURL(new RegExp(`/dive/${id}$`))
  await expect(page.getByText("Strong drift north")).toBeVisible()
  const after = await getLog(page.request)
  expect(after.version).not.toBe(before.version)
  // The form is gone from history: Back from the detail reaches the Log.
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
})

test("ignores a dive from the form, which takes away its number @writes", async ({
  page,
  restore,
}) => {
  const id = await diveId(page.request, 63)
  restore((request) => patchDive(request, id, { ignored: false }))
  await page.goto(`/dive/${id}`)
  const number = page.getByText(/^Dive \d+$/)
  await expect(number).toBeVisible()
  await page.getByRole("link", { name: "Edit" }).click()
  // A native checkbox, so Safari plays its haptic (see ui/switch.tsx).
  const ignore = page.getByRole("checkbox", { name: /^Ignore this dive/ })
  await expect(ignore).not.toBeChecked()
  await ignore.click()
  await expect(ignore).toBeChecked()
  await page.getByRole("button", { name: "Save", exact: true }).click()

  await expect(page).toHaveURL(new RegExp(`/dive/${id}$`))
  // Once the sync after the save has landed.
  await expect(page.getByText("Ignored", { exact: true })).toBeAttached()
  await expect(number).toHaveCount(0)
  const log = await getLog(page.request)
  expect(log.dives.find((dive) => dive.id === id)).toMatchObject({
    ignored: true,
    number: null,
  })
})

test("keeps the form's values and offers Try again when the server can't be reached", async ({
  page,
}) => {
  const id = await diveId(page.request, 63)
  await page.route(`**/api/dives/${id}`, (route) =>
    route.request().method() === "PATCH" ? route.abort() : route.fallback()
  )
  await page.goto(`/dive/${id}/edit`)
  await page.getByLabel("General").fill("Kept while offline")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible()
  await expect(page.getByLabel("General")).toHaveValue("Kept while offline")
  await expect(page).toHaveURL(new RegExp(`/dive/${id}/edit$`))
})

// iOS often kills a backgrounded home-screen app mid-entry; reopening the
// form brings back what was typed, and discarding forgets it.
test("brings back a new dive's typing after the app is reopened", async ({
  page,
}) => {
  await page.goto("/dive/new")
  await page.getByLabel("General").fill("Kept through a reload")
  // Written once typing pauses, read straight from the phone's storage.
  const kept = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const open = indexedDB.open("shylog-queue")
          open.onsuccess = () => {
            const get = open.result
              .transaction("forms")
              .objectStore("forms")
              .get("new")
            get.onsuccess = () => {
              resolve(get.result?.values.values.notes ?? null)
              open.result.close()
            }
          }
        })
    )
  await expect.poll(kept).toBe("Kept through a reload")

  await page.reload()
  await expect(page.getByLabel("General")).toHaveValue("Kept through a reload")
  await page.getByRole("button", { name: "Cancel" }).click()
  await page.getByRole("button", { name: "Discard changes" }).click()
  await expect.poll(kept).toBeNull()
  await page.getByRole("link", { name: "Log a dive" }).click()
  await expect(page.getByLabel("General")).toHaveValue("")
})

// iOS raises the keyboard only for a focus inside the tap itself, so the
// names sheet's field must have it before the row's click is over. Closing
// gives focus back to the row.
test("focuses the names sheet's field within the row's tap", async ({
  page,
}) => {
  await page.goto("/dive/new")
  await page.evaluate(() =>
    window.addEventListener(
      "click",
      () =>
        document.body.setAttribute(
          "data-focused",
          document.activeElement?.getAttribute("aria-label") ?? ""
        ),
      { once: true }
    )
  )
  const row = page.getByRole("button", { name: /^Buddies,/ })
  await row.click()
  await expect(page.locator("body")).toHaveAttribute("data-focused", "Buddies")
  await still(sheet(page))
  await page.keyboard.press("Escape")
  await expect(row).toBeFocused()
})
