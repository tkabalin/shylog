import { expect, test } from "@playwright/test"

import { aFrame, byBoat, bySite, drawn, sites } from "./explore"
import { still } from "./ui"

// The site list and the filters: access, depth, the page tags, wind and swell.

test.describe("at phone width", () => {
  test("lists the sites from the count, and Back closes the list", async ({
    page,
  }) => {
    await page.goto("/explore")
    await drawn(page)
    await page
      .getByRole("button", { name: `List of ${sites.length} sites` })
      .click()
    const list = page.getByRole("region", { name: "Dive sites" })
    await expect(
      list.getByRole("heading", { name: "Atlantic coast" })
    ).toBeVisible()
    // A screen a level deeper, which Back closes, back to the map.
    await page.goBack()
    await expect(list).toHaveCount(0)
    await expect(page).toHaveURL(/\/explore$/)
    await page
      .getByRole("button", { name: `List of ${sites.length} sites` })
      .click()
    // Its search ignores case, accents, punctuation and spaces.
    await list.getByRole("textbox", { name: "Search sites" }).fill("a frame")
    await list.getByRole("button", { name: /^A-Frame/ }).click()
    await expect(page).toHaveURL(bySite("a-frame"))
    await expect(list).toHaveCount(0)
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: aFrame.name })
    ).toBeVisible()
    // The pick took the list's place, so Back leaves Explore (and the tab
    // took the Log's, as tabs do).
    await page.goBack()
    await expect(page).not.toHaveURL(/\/explore/)
  })

  test("keeps filters set on the list when Back closes it", async ({
    page,
  }) => {
    await page.goto("/explore")
    await drawn(page)
    await page
      .getByRole("button", { name: `List of ${sites.length} sites` })
      .click()
    const list = page.getByRole("region", { name: "Dive sites" })
    await list.getByRole("combobox", { name: "Access, Any access" }).click()
    await page.getByRole("option", { name: "Boat", exact: true }).click()
    await page.keyboard.press("Escape")
    const boat = sites.filter(byBoat).length
    await expect(list.getByRole("listitem")).toHaveCount(boat)
    // The search looks among the boat dives alone.
    const search = list.getByRole("textbox", { name: "Search sites" })
    await search.fill("rock")
    await expect(list.getByRole("listitem")).toHaveCount(
      sites.filter((site) => byBoat(site) && /rock/i.test(site.name)).length
    )
    await search.fill("")
    await page.goBack()
    await expect(list).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: `List of ${boat} sites` })
    ).toBeVisible()
    await expect(page).toHaveURL(/access=boat/)
  })

  test("puts down a site hidden by filters set on the list", async ({
    page,
  }) => {
    await page.goto("/explore?site=a-frame")
    await drawn(page)
    await page
      .getByRole("button", { name: `List of ${sites.length} sites` })
      .click()
    const list = page.getByRole("region", { name: "Dive sites" })
    await list.getByRole("combobox", { name: "Access, Any access" }).click()
    await page.getByRole("option", { name: "Boat", exact: true }).click()
    await page.keyboard.press("Escape")
    // The map's entry under the list still had A-Frame, a shore dive.
    await page.goBack()
    await expect(list).toHaveCount(0)
    await expect(page).toHaveURL(/access=boat/)
    await expect(page).not.toHaveURL(bySite("a-frame"))
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })

  test("filters the map by access, and puts down a site it hides", async ({
    page,
  }) => {
    await page.goto("/explore?site=a-frame")
    await drawn(page)
    await page.getByRole("combobox", { name: "Access, Any access" }).click()
    await page.getByRole("option", { name: "Boat", exact: true }).click()
    await page.keyboard.press("Escape")
    await expect(
      page.getByRole("combobox", { name: "Access, Boat" })
    ).toHaveText(/^Boat/)
    const count = sites.filter(byBoat).length
    await expect(
      page.getByRole("button", { name: `List of ${count} sites` })
    ).toBeVisible()
    await expect(page).toHaveURL(/access=boat/)
    // A-Frame is a shore dive, so it went down with the filter.
    await expect(page).not.toHaveURL(bySite("a-frame"))
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })

  test("filters on max depth, leaving out sites with none", async ({
    page,
  }) => {
    await page.goto("/explore?depth=18-30")
    await drawn(page)
    await expect(
      page.getByRole("button", { name: "Max depth, 18–30 m" })
    ).toBeVisible()
    const count = sites.filter(
      ({ depth }) => depth !== undefined && depth >= 18 && depth <= 30
    ).length
    await page.getByRole("button", { name: `List of ${count} sites` }).click()
    const list = page.getByRole("region", { name: "Dive sites" })
    await expect(list.getByRole("listitem")).toHaveCount(count)
    // Filters that leave nothing can all be cleared at once.
    await page.goto("/explore?view=list&types=fresh&depth=30-35")
    await expect(list.getByText("No sites match these filters.")).toBeVisible()
    await list.getByRole("button", { name: "Clear filters" }).click()
    await expect(list.getByRole("listitem")).toHaveCount(sites.length)
  })

  // Night dives on a reef: the phone's sheet holds the type.
  const nightReefs = sites.filter(
    ({ goodFor, type }) => goodFor?.includes("night") && type === "reef"
  ).length

  test("filters on the page tags from one sheet", async ({ page }) => {
    await page.goto("/explore")
    await drawn(page)
    await page.getByRole("button", { name: "Filters", exact: true }).click()
    const sheet = page.getByRole("dialog", { name: "Filters" })
    await still(sheet)
    await sheet.getByRole("button", { name: "Night dives" }).click()
    await sheet.getByRole("button", { name: "Reefs" }).click()
    // Reset clears the sheet's own ticks before they're applied.
    await sheet.getByRole("button", { name: "Reset" }).click()
    await expect(sheet.getByRole("button", { name: "Reset" })).toBeDisabled()
    await sheet.getByRole("button", { name: "Night dives" }).click()
    await sheet.getByRole("button", { name: "Reefs" }).click()
    await sheet
      .getByRole("button", { name: `Show ${nightReefs} sites` })
      .click()
    await expect(sheet).toBeHidden()
    await expect(page).toHaveURL(/good=night/)
    await expect(page).toHaveURL(/types=reef/)
    await expect(
      page.getByRole("button", { name: "Filters, 2 set", exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: `List of ${nightReefs} sites` })
    ).toBeVisible()
  })

  test("opens with the page tags from the address, ticked in the sheet", async ({
    page,
  }) => {
    await page.goto("/explore?good=night&types=reef")
    await drawn(page)
    await expect(
      page.getByRole("button", { name: `List of ${nightReefs} sites` })
    ).toBeVisible()
    await page.getByRole("button", { name: "Filters, 2 set" }).click()
    const sheet = page.getByRole("dialog", { name: "Filters" })
    await still(sheet)
    await expect(
      sheet.getByRole("button", { name: "Night dives" })
    ).toHaveAttribute("aria-pressed", "true")
    await expect(sheet.getByRole("button", { name: "Reefs" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  test("clears every filter from the map, keeping the picked site", async ({
    page,
  }) => {
    await page.goto("/explore?types=wreck&depth=18-30&wind=se&site=ss-maori")
    await drawn(page)
    await page.getByRole("button", { name: "Clear filters" }).click()
    await expect(page).not.toHaveURL(/types=|depth=|wind=/)
    await expect(page).toHaveURL(bySite("ss-maori"))
    await expect(
      page.getByRole("button", { name: `List of ${sites.length} sites` })
    ).toBeVisible()
    // Folded away, as on the Log, until a filter is set again: inert,
    // which role queries still find, and no wider than the gap.
    const fold = page.locator("div[inert]:has(> [aria-label='Clear filters'])")
    await expect(fold).toHaveCount(1)
    await expect
      .poll(() => fold.evaluate((el) => el.getBoundingClientRect().width))
      .toBe(0)
  })
})

test.describe("at desktop width", () => {
  test.use({ viewport: { width: 1024, height: 768 } })

  // A south-easter keeps the sites good in it or a point either side.
  const southEasterly = sites.filter(({ wind }) =>
    wind?.some((point) => ["e", "se", "s"].includes(point))
  ).length

  test("drags the wind round its dial, and clears it from the centre", async ({
    page,
  }) => {
    await page.goto("/explore")
    await drawn(page)
    await page.getByRole("button", { name: "Conditions", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Conditions" })
    await still(dialog)
    const points = dialog.getByRole("group", { name: "Wind" })
    const box = (await points.boundingBox())!
    // Between the hub and the points, clear of both, at a bearing.
    const at = (degrees: number) => {
      const turn = (degrees * Math.PI) / 180
      return [
        box.x + box.width * (0.5 + 0.17 * Math.sin(turn)),
        box.y + box.height * (0.5 - 0.17 * Math.cos(turn)),
      ] as const
    }
    await page.mouse.move(...at(0))
    await page.mouse.down()
    for (let degrees = 15; degrees <= 135; degrees += 15)
      await page.mouse.move(...at(degrees))
    await page.mouse.up()
    await expect(
      points.getByRole("button", { name: "South-east" })
    ).toHaveAttribute("aria-pressed", "true")
    await expect(
      dialog.getByRole("button", { name: `Show ${southEasterly} sites` })
    ).toBeVisible()
    await expect(
      dialog.getByText("Sites good in a south-easterly, E to S")
    ).toBeVisible()
    await expect(dialog.getByText("Any swell", { exact: true })).toBeVisible()
    await dialog
      .getByRole("group", { name: "Swell" })
      .getByRole("button", { name: "South-west" })
      .click()
    await expect(
      dialog.getByText("Sites not exposed to south-westerly swell")
    ).toBeVisible()
    await dialog.getByRole("button", { name: "Any swell" }).click()
    await dialog.getByRole("button", { name: "Any wind" }).click()
    await expect(
      points.getByRole("button", { name: "South-east" })
    ).not.toHaveAttribute("aria-pressed", "true")
    await expect(
      dialog.getByRole("button", { name: `Show ${sites.length} sites` })
    ).toBeVisible()
  })

  test("filters on the wind from the Conditions pill", async ({ page }) => {
    await page.goto("/explore")
    await drawn(page)
    await page.getByRole("button", { name: "Conditions", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Conditions" })
    await still(dialog)
    await dialog
      .getByRole("group", { name: "Wind" })
      .getByRole("button", { name: "South-east" })
      .click()
    await dialog
      .getByRole("button", { name: `Show ${southEasterly} sites` })
      .click()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/wind=se/)
    const card = page.getByRole("region", { name: "Dive sites" })
    await expect(
      card.getByText(`${southEasterly} of ${sites.length} sites`, {
        exact: true,
      })
    ).toBeVisible()
    await expect(
      card.getByRole("button", { name: "Conditions, 1 set", exact: true })
    ).toHaveText("Conditions · 1")
  })

  test("filters on skills from their own pill, keeping the order ticked", async ({
    page,
  }) => {
    await page.goto("/explore")
    await drawn(page)
    const card = page.getByRole("region", { name: "Dive sites" })
    await card.getByRole("combobox", { name: "Skills, Any skills" }).click()
    await page.getByRole("option", { name: "No DSMB" }).click()
    await page.getByRole("option", { name: "No special skills" }).click()
    await page.keyboard.press("Escape")
    await expect(page).toHaveURL(/skills=dsmb%2Cbasic|skills=dsmb,basic/)
    await expect(
      card.getByRole("combobox", { name: "Skills, No DSMB, No special skills" })
    ).toHaveText(/No DSMB \+ 1/)
    const count = sites.filter(
      ({ noSpecialSkills, needs }) =>
        noSpecialSkills && !needs?.includes("dsmb")
    ).length
    await expect(
      card.getByText(`${count} of ${sites.length} sites`, { exact: true })
    ).toBeVisible()
    // Clear is in the heading, by the count, not in the row of pills.
    await card.getByRole("button", { name: "Clear filters" }).click()
    await expect(page).not.toHaveURL(/skills=/)
    await expect(
      card.getByText(`${sites.length} sites`, { exact: true })
    ).toBeVisible()
    await expect(
      card.getByRole("button", { name: "Clear filters" })
    ).toHaveCount(0)
  })

  test("lists the sites in a card that opens folded to its search", async ({
    page,
  }) => {
    await page.goto("/explore")
    const map = await drawn(page)
    const card = page.getByRole("region", { name: "Dive sites" })
    await expect(card.getByText(`${sites.length} sites`)).toBeVisible()
    // Folded at first, so the map comes first.
    const row = card.getByRole("button", { name: /^A-Frame/ })
    await expect(row).toBeHidden()
    await card.getByRole("button", { name: "Show the list" }).click()
    await expect(row).toBeVisible()
    // The window's height, 12 px in.
    expect((await card.boundingBox())!.height).toBeCloseTo(map.height - 24, 0)
    await card.getByRole("button", { name: "Hide the list" }).click()
    await expect(row).toBeHidden()
    // Searching brings the list back.
    await card.getByRole("textbox", { name: "Search sites" }).fill("a frame")
    await expect(row).toBeVisible()
    await row.click()
    await expect(page).toHaveURL(bySite("a-frame"))
    const site = page.getByRole("region", { name: aFrame.name })
    await site.getByRole("link", { name: "Dive sites" }).click()
    await expect(card).toBeVisible()
    await expect(
      card.getByRole("textbox", { name: "Search sites" })
    ).toHaveValue("a frame")
  })
})
