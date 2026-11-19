import { expect, test } from "@playwright/test"

import {
  byBoat,
  bySite,
  castle,
  castor,
  drawn,
  english,
  escape,
  pagesByShared,
  resting,
} from "./explore"
import { still } from "./ui"

// A whole page several sites share: its sheet and card, its sites, and the way between them.

test.describe("at phone width", () => {
  test("opens a whole page from the address, and its sites with the way back", async ({
    page,
  }) => {
    test.slow()
    await page.goto("/")
    // Its code loaded first: WebKit reloads a lazy route left mid-import.
    await expect(page.getByRole("heading", { name: "Log" })).toBeAttached()
    await page.goto(`/explore?site=${castle.id}`)
    const map = await drawn(page)
    const sheet = page.getByRole("dialog", { name: castle.name })
    await resting(sheet)
    await expect(
      sheet.getByText("False Bay coast", { exact: true })
    ).toBeVisible()
    await expect(
      sheet.getByRole("term").filter({ hasText: "Sites" }).locator("+ dd")
    ).toHaveText(String(castle.sites.length))
    await sheet.getByRole("button", { name: "Read more" }).click()
    await resting(sheet)
    // A to Z, its rows first, then the maps the strip loads.
    const rows = sheet
      .getByRole("list", { name: `Sites on ${castle.name}` })
      .getByRole("link")
    await expect(rows).toHaveText(
      [...castle.sites]
        .sort((a, b) => english.compare(a.name, b.name))
        .map(({ name }) => new RegExp(`^${escape(name)}`))
    )
    const to = castle.sites.at(-1)!
    const row = rows.filter({ hasText: to.name })
    await still(row)
    await row.click()
    await expect(page).toHaveURL(bySite(to.id))
    const next = page.getByRole("dialog", { name: to.name })
    await resting(next)
    // In place of the area line, back to the page, raised as it was.
    const back = next.getByRole("link", { name: castle.name, exact: true })
    await still(back)
    await back.click()
    await expect(page).toHaveURL(bySite(castle.id))
    expect((await resting(sheet)).y).toBeCloseTo(map.y, 0)
    // Each step replaced the address, so Back leaves Explore.
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
  })

  test("opens a site's whole page from its sheet, with the way back", async ({
    page,
  }) => {
    test.slow()
    const from = castle.sites[0]!
    await page.goto(`/explore?site=${from.id}`)
    await drawn(page)
    const sheet = page.getByRole("dialog", { name: from.name })
    await resting(sheet)
    await sheet.getByRole("button", { name: "Read more" }).first().click()
    await resting(sheet)
    // The maps above it have come, so it won't move under the tap.
    await expect(
      sheet.getByRole("list", { name: "Maps and images" })
    ).toBeVisible()
    const whole = sheet.getByRole("link", {
      name: `${castle.name} ${castle.sites.length} sites`,
      exact: true,
    })
    await whole.scrollIntoViewIfNeeded()
    await still(whole)
    await whole.click()
    await expect(page).toHaveURL(bySite(castle.id))
    const pageSheet = page.getByRole("dialog", { name: castle.name })
    await resting(pageSheet)
    // Its Back row, and its own row for the site, which is listed too.
    const links = pageSheet.getByRole("link", { name: from.name, exact: true })
    await expect(links).toHaveCount(2)
    await still(links.first())
    await links.first().click()
    await expect(page).toHaveURL(bySite(from.id))
  })

  test("keeps a whole page picked while a filter leaves any of its sites", async ({
    page,
  }) => {
    // One with a boat dive among shore dives stays; one with none goes.
    const mixed = pagesByShared.find(
      ({ sites: on }) => on.some(byBoat) && !on.every(byBoat)
    )!
    const ashore = pagesByShared.find(({ sites: on }) => !on.some(byBoat))!
    const boat = async () => {
      await page.getByRole("combobox", { name: "Access, Any access" }).click()
      await page.getByRole("option", { name: "Boat", exact: true }).click()
      await page.keyboard.press("Escape")
      await expect(page).toHaveURL(/access=boat/)
    }
    await page.goto(`/explore?site=${mixed.id}`)
    await drawn(page)
    await boat()
    await expect(page).toHaveURL(bySite(mixed.id))
    await expect(page.getByRole("dialog", { name: mixed.name })).toBeVisible()
    await page.goto(`/explore?site=${ashore.id}`)
    await drawn(page)
    await boat()
    await expect(page).not.toHaveURL(bySite(ashore.id))
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })
})

test.describe("at desktop width", () => {
  test.use({ viewport: { width: 1024, height: 768 } })

  test("opens a whole page in the card, its sites listed at once", async ({
    page,
  }) => {
    await page.goto(`/explore?site=${castor.id}`)
    await drawn(page)
    const card = page.getByRole("region", { name: castor.name })
    await expect(
      card
        .getByRole("list", { name: `Sites on ${castor.name}` })
        .getByRole("listitem")
    ).toHaveCount(castor.sites.length)
    const to = castor.sites[0]!
    await card.getByRole("link", { name: to.name }).click()
    await expect(page).toHaveURL(bySite(to.id))
    const next = page.getByRole("region", { name: to.name })
    // Back to the page, its card as it was, not read on.
    await next
      .getByRole("navigation", { name: "breadcrumb" })
      .getByRole("link", { name: castor.name })
      .click()
    await expect(page).toHaveURL(bySite(castor.id))
    await expect(card.getByRole("button", { name: "Read more" })).toBeVisible()
    // And from a site's card to its whole page: by the page's name beside
    // the area, and, once read on, by its row.
    await page.goto(`/explore?site=${to.id}`)
    await next.getByRole("link", { name: castor.name, exact: true }).click()
    await expect(page).toHaveURL(bySite(castor.id))
    await page.goto(`/explore?site=${to.id}`)
    await next.getByRole("button", { name: "Read more" }).click()
    await next
      .getByRole("link", {
        name: `${castor.name} ${castor.sites.length} sites`,
        exact: true,
      })
      .click()
    await expect(page).toHaveURL(bySite(castor.id))
  })
})
