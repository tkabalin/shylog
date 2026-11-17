import { expect, type Locator, type Page } from "@playwright/test"

import type { Packing } from "@shylog/core"

import { getLog, putPacking, test } from "./api"

const item = (page: Page, name: string) =>
  page.getByRole("checkbox", { name, exact: true })
const editButton = (page: Page) =>
  page.getByRole("button", { name: "Edit", exact: true })
// A row's field in Edit mode, and the grip after it.
const field = (page: Page, name: string) =>
  page.locator(`input[value="${name}"]:not([readonly])`)
const grip = (page: Page, name: string) =>
  field(page, name).locator("xpath=following-sibling::span")

// A drag by a grip to a point, a frame a step, as a finger moves.
async function drag(page: Page, handle: Locator, toY: number) {
  const box = (await handle.boundingBox())!
  const x = box.x + box.width / 2
  const fromY = box.y + box.height / 2
  await page.mouse.move(x, fromY)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(x, fromY + ((toY - fromY) * i) / 12)
    await page.waitForTimeout(16)
  }
  await page.mouse.up()
  // The copy settles into place before the next drag can lift a row.
  await expect(page.locator("input[readonly]")).toHaveCount(0)
}

test("ticks items that stay ticked over a reload, and Reset clears them with Undo", async ({
  page,
}) => {
  await page.goto("/you")
  await page.getByRole("link", { name: /Packing list/ }).click()
  await expect(page).toHaveURL("/you/packing")
  await item(page, "BCD").click()
  await item(page, "Mask").click()
  await expect(item(page, "BCD")).toBeChecked()
  await expect(page.getByText("2 of 25 packed")).toBeVisible()

  await page.reload()
  await expect(item(page, "BCD")).toBeChecked()
  await expect(item(page, "Snorkel")).not.toBeChecked()

  await page.getByRole("button", { name: "Reset" }).click()
  await expect(item(page, "BCD")).not.toBeChecked()
  await expect(page.getByText("0 of 25 packed")).toBeVisible()
  await expect(page.getByRole("button", { name: "Reset" })).toBeDisabled()
  await page.getByRole("button", { name: "Undo" }).click()
  await expect(item(page, "BCD")).toBeChecked()
  await expect(item(page, "Mask")).toBeChecked()

  // Pushed from You, so Back returns there.
  await page.goBack()
  await expect(page).toHaveURL("/you")
  await expect(page.getByRole("link", { name: /Packing list/ })).toBeVisible()
})

test("edits the list: renames, adds, deletes and moves items and sections @writes", async ({
  page,
  restore,
}) => {
  const before = (await getLog(page.request)).packing
  restore((request) => putPacking(request, before))
  await page.goto("/you/packing")
  await item(page, "Snorkel").click()
  await editButton(page).click()

  // Soft gear's heading carries the whole section above Hard gear.
  const top = (await field(page, "Hard gear").boundingBox())!.y
  await drag(page, grip(page, "Soft gear"), top - 20)
  // Mask goes from Soft gear into Hard gear, past its heading.
  const bcd = (await field(page, "BCD").boundingBox())!
  await drag(page, grip(page, "Mask"), bcd.y + bcd.height)

  await field(page, "Defog").fill("Defog spray")
  await page.getByRole("button", { name: "Delete Snorkel" }).click()
  await page.getByRole("button", { name: "Add item" }).nth(3).click()
  await page.keyboard.type("Logbook")
  await page.getByRole("button", { name: "Add section" }).click()
  await page.keyboard.type("Boat")
  await page.getByRole("button", { name: "Add item" }).nth(4).click()
  await page.keyboard.type("Seasickness tablets")
  await page.getByRole("button", { name: "Done" }).click()
  await expect(editButton(page)).toBeVisible()

  const { sections } = (await getLog(page.request)).packing
  const names = (i: number) => sections[i].items.map((row) => row.name)
  expect(sections.map((section) => section.name)).toEqual([
    "Soft gear",
    "Hard gear",
    "Accessories",
    "Personal",
    "Boat",
  ])
  expect(names(0)).toEqual(["Fins", "Boots", "Wetsuit", "Hood", "Gloves"])
  expect(names(1)).toContain("Mask")
  expect(names(2)).toContain("Defog spray")
  expect(names(3).at(-1)).toBe("Logbook")
  expect(names(4)).toEqual(["Seasickness tablets"])
  // Snorkel's tick went with it, from this phone's storage too.
  await expect(page.getByText("0 of 26 packed")).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("packing-ticks")))
    .toBe("[]")

  // A section asks before its items go with it; Cancel leaves the list as
  // it was.
  await editButton(page).click()
  await page.getByRole("button", { name: "Delete BCD" }).click()
  await page.getByRole("button", { name: "Delete Accessories" }).click()
  const sheet = page.getByRole("alertdialog")
  await expect(sheet).toContainText("Its 4 items go with it.")
  await sheet.getByRole("button", { name: "Delete section" }).click()
  await expect(sheet).toBeHidden()
  await expect(field(page, "Accessories")).toHaveCount(0)
  await expect(field(page, "SMB")).toHaveCount(0)
  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(item(page, "BCD")).toBeVisible()
  await expect(item(page, "SMB")).toBeVisible()
})

test("shows another phone's change in an untouched Edit mode, and Done keeps it @writes", async ({
  page,
  restore,
}) => {
  const before = (await getLog(page.request)).packing
  restore((request) => putPacking(request, before))
  await page.goto("/you/packing")
  await editButton(page).click()
  await expect(field(page, "BCD")).toBeVisible()
  // Another phone adds an item while this one has Edit open.
  const [first, ...rest] = before.sections
  await putPacking(page.request, {
    sections: [
      {
        ...first,
        items: [...first.items, { id: "item-logbook", name: "Logbook" }],
      },
      ...rest,
    ],
  })
  // The sync as the app comes back to the foreground brings it in.
  await expect(async () => {
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange"))
    )
    await expect(field(page, "Logbook")).toBeVisible({ timeout: 1000 })
  }).toPass()
  await page.getByRole("button", { name: "Done" }).click()
  await expect(editButton(page)).toBeVisible()
  const { sections } = (await getLog(page.request)).packing
  expect(sections[0].items.at(-1)?.name).toBe("Logbook")
})

// A phone can't ask before iOS's back swipe leaves, so Edit mode keeps its
// changes instead, through Back and a reload, until Cancel drops them.
test("keeps Edit mode's changes after leaving, until Cancel", async ({
  page,
}) => {
  await page.goto("/you")
  await page.getByRole("link", { name: /Packing list/ }).click()
  await editButton(page).click()
  await field(page, "BCD").fill("BCD and spare strap")
  await expect.poll(() => keptList(page)).not.toBeNull()
  await page.goBack()
  await expect(page).toHaveURL("/you")

  await page.getByRole("link", { name: /Packing list/ }).click()
  await expect(field(page, "BCD and spare strap")).toBeVisible()
  await page.reload()
  await expect(field(page, "BCD and spare strap")).toBeVisible()

  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(item(page, "BCD")).toBeVisible()
  await editButton(page).click()
  await expect(field(page, "BCD")).toBeVisible()
  await expect(field(page, "BCD and spare strap")).toHaveCount(0)
})

// The list in the phone's copy of the log, as the screen reads it.
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
          get.onsuccess = () => resolve(get.result?.packing)
          get.transaction!.oncomplete = () => db.close()
        }
      })
  )
// A sync, as the app coming back to the foreground starts one.
const foreground = (page: Page) =>
  page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")))
const keptList = (page: Page) =>
  page.evaluate(() => sessionStorage.getItem("shylog-kept:packing"))

// The list with an item another phone added.
const withLogbook = ({ sections: [first, ...rest] }: Packing): Packing => ({
  sections: [
    {
      ...first!,
      items: [...first!.items, { id: "item-logbook", name: "Logbook" }],
    },
    ...rest,
  ],
})

// Kept changes were made to the list as it was. Once another phone has
// changed it, they go rather than undo that change, even when this phone's
// copy only catches up after Edit mode has opened with them.
test("drops Edit mode's kept changes once the list changed elsewhere @writes", async ({
  page,
  restore,
}) => {
  const before = (await getLog(page.request)).packing
  restore((request) => putPacking(request, before))
  await page.goto("/you/packing")
  await editButton(page).click()
  await field(page, "BCD").fill("BCD kept")
  await expect.poll(() => keptList(page)).not.toBeNull()
  // Its startup sync done (a 304 counts), so the hold below catches none.
  const synced = page.waitForResponse((response) =>
    response.url().endsWith("/api/log")
  )
  await page.goto("/you")
  await synced
  await expect.poll(() => mirrored(page)).toEqual(before)

  // No sync lands until the screen has opened with the kept rows.
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route("**/api/log", async (route) => {
    await held
    await route.fallback()
  })
  await putPacking(page.request, withLogbook(before))
  await page.getByRole("link", { name: /Packing list/ }).click()
  await expect(field(page, "BCD kept")).toBeVisible()
  release()
  await foreground(page)
  await expect(field(page, "Logbook")).toBeVisible()
  await expect(field(page, "BCD")).toBeVisible()
  await expect(field(page, "BCD kept")).toHaveCount(0)
  await expect.poll(() => keptList(page)).toBeNull()
})

// Edited again after they came back, the kept rows are the diver's latest
// work: a newer list no longer replaces them, and Done refuses instead.
test("keeps kept changes edited again, and refuses Done over a newer list @writes", async ({
  page,
  restore,
}) => {
  const before = (await getLog(page.request)).packing
  restore((request) => putPacking(request, before))
  await page.goto("/you/packing")
  await editButton(page).click()
  await field(page, "BCD").fill("BCD kept")
  await expect.poll(() => keptList(page)).not.toBeNull()
  const synced = page.waitForResponse((response) =>
    response.url().endsWith("/api/log")
  )
  await page.goto("/you")
  await synced
  await expect.poll(() => mirrored(page)).toEqual(before)

  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route("**/api/log", async (route) => {
    await held
    await route.fallback()
  })
  const changed = withLogbook(before)
  await putPacking(page.request, changed)
  await page.getByRole("link", { name: /Packing list/ }).click()
  await expect(field(page, "BCD kept")).toBeVisible()
  await field(page, "Mask").fill("Mask and spare")
  release()
  await expect(async () => {
    await foreground(page)
    expect(await mirrored(page)).toEqual(changed)
  }).toPass()
  await expect(field(page, "BCD kept")).toBeVisible()
  await expect(field(page, "Mask and spare")).toBeVisible()
  await expect(field(page, "Logbook")).toHaveCount(0)
  await page.getByRole("button", { name: "Done" }).click()
  await expect(
    page.getByText("The list changed on another device")
  ).toBeVisible()
  expect((await getLog(page.request)).packing).toEqual(changed)
})

// The whole list is sent, so Done won't save over another phone's change
// made while this one was editing.
test("refuses Done once another phone has changed the list @writes", async ({
  page,
  restore,
}) => {
  const before = (await getLog(page.request)).packing
  restore((request) => putPacking(request, before))
  await page.goto("/you/packing")
  await editButton(page).click()
  await field(page, "BCD").fill("BCD and spare strap")
  const changed = withLogbook(before)
  await putPacking(page.request, changed)
  await expect(async () => {
    await foreground(page)
    expect(await mirrored(page)).toEqual(changed)
  }).toPass()
  await page.getByRole("button", { name: "Done" }).click()
  await expect(
    page.getByText("The list changed on another device")
  ).toBeVisible()
  expect((await getLog(page.request)).packing).toEqual(changed)
})

test("asks for a name before saving a blank section or item", async ({
  page,
}) => {
  await page.goto("/you/packing")
  await editButton(page).click()
  await field(page, "Accessories").fill("")
  await page.getByRole("button", { name: "Add item" }).nth(3).click()
  await page.getByRole("button", { name: "Done" }).click()
  await expect(page.getByText("Name this section")).toBeVisible()
  await expect(page.getByText("Name this item")).toBeVisible()
  // The first blank row takes focus.
  await expect(
    page.getByRole("textbox", { name: "Section name" }).nth(2)
  ).toBeFocused()
  // Deleting the blank item clears its error, and nothing was saved.
  await page.getByRole("button", { name: "Delete item" }).click()
  await expect(page.getByText("Name this item")).toHaveCount(0)
  await expect(editButton(page)).toHaveCount(0)
  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(page.getByRole("heading", { name: "Accessories" })).toBeVisible()
})

test("shows and ticks the list offline, with editing disabled", async ({
  page,
  context,
}) => {
  await page.goto("/you/packing")
  await expect(item(page, "BCD")).toBeVisible()
  await context.setOffline(true)
  await expect(editButton(page)).toBeDisabled()
  await expect(page.getByRole("img", { name: "Offline" })).toBeVisible()
  await item(page, "BCD").click()
  await expect(item(page, "BCD")).toBeChecked()
})
