import { expect, test } from "@playwright/test"

import { aFrame, bySite, drawn, sites, withSatellite } from "./explore"
import { still } from "./ui"

// Map options: the zones, the marine protected areas' rules and satellite imagery.

test.describe("at phone width", () => {
  test("opens the rules at a site's MPA, and Back returns to the site", async ({
    page,
  }) => {
    await page.goto("/explore?site=mv-afrikaner")
    await drawn(page)
    const sheet = page.getByRole("dialog")
    await sheet.getByRole("button", { name: /^No diving/ }).click()
    const rules = page.getByRole("region", { name: "Marine protected areas" })
    const robben = rules.getByRole("heading", { name: "Robben Island" })
    await expect(robben).toBeInViewport()
    await expect(
      rules.getByRole("heading", { name: "Table Mountain" })
    ).not.toBeInViewport()
    await page.goBack()
    await expect(rules).toHaveCount(0)
    await expect(page).toHaveURL(bySite("mv-afrikaner"))
    await expect(sheet).toBeVisible()
  })

  test("hides the zones from Map options, and keeps the choice", async ({
    page,
  }) => {
    await page.goto("/explore")
    await drawn(page)
    await page.getByRole("button", { name: "Map options" }).click()
    const options = page.getByRole("dialog", { name: "Map" })
    const zones = options.getByLabel("MPA zones")
    await expect(zones).toBeChecked()
    await zones.click()
    await expect(zones).not.toBeChecked()
    await page.reload()
    await drawn(page)
    await page.getByRole("button", { name: "Map options" }).click()
    await expect(zones).not.toBeChecked()
    await zones.click()
    // The rules from here open at their top, and the sheet closes.
    await options.getByRole("button", { name: "Zone rules" }).click()
    await expect(options).toHaveCount(0)
    await expect(
      page
        .getByRole("region", { name: "Marine protected areas" })
        .getByRole("heading", { name: "Table Mountain" })
    ).toBeInViewport()
  })

  test("goes back from the rules to Map options, open at once", async ({
    page,
  }) => {
    await page.goto("/explore")
    await drawn(page)
    const button = page.getByRole("button", { name: "Map options" })
    await button.click()
    const options = page.getByRole("dialog", { name: "Map" })
    // Once the sheet has come up: WebKit drops a tap on a row still moving.
    const row = options.getByRole("button", { name: "Zone rules" })
    await still(row)
    await row.click()
    // The sheet goes with the rules' arrival, not sliding down over them.
    const rules = page.getByRole("region", { name: "Marine protected areas" })
    await expect(rules).toBeVisible()
    expect(await options.count()).toBe(0)
    await expect(rules.getByRole("link", { name: "Map" })).toBeFocused()
    // iOS's back swipe shows the page as it was left, sheet open, so it's
    // there at once: a slide up would play after the snapshot went.
    await page.evaluate(() =>
      document.addEventListener(
        "transitionrun",
        ({ target }) => {
          if ((target as Element).matches("[data-slot^=drawer-]"))
            document.body.dataset.slid = ""
        },
        true
      )
    )
    await page.goBack()
    await expect(rules).toHaveCount(0)
    await expect(options).toBeVisible()
    await page.evaluate(() => new Promise(requestAnimationFrame))
    await expect(page.locator("body")).not.toHaveAttribute("data-slid")
    // Closed now, it hands focus back to its button as usual.
    await options.getByRole("button", { name: "Done" }).click()
    await expect(options).toHaveCount(0)
    await expect(button).toBeFocused()
  })

  test("switches to satellite from Map options, and keeps the choice", async ({
    page,
    context,
  }) => {
    const mapTiles = await withSatellite(page)
    await page.goto("/explore")
    await drawn(page)
    await page.getByRole("button", { name: "Map options" }).click()
    const options = page.getByRole("dialog", { name: "Map" })
    const looks = options.getByRole("group", { name: "Map type" })
    const map = looks.getByRole("button", { name: "Map", exact: true })
    const satellite = looks.getByRole("button", { name: "Satellite" })
    await expect(map).toHaveAttribute("aria-pressed", "true")
    await expect(
      options.getByText(
        "Zone shading and the Cape Point bands show on Map only."
      )
    ).toBeVisible()
    expect(mapTiles()).toEqual([])
    await satellite.click()
    await expect(satellite).toHaveAttribute("aria-pressed", "true")
    await expect.poll(() => mapTiles().length).toBeGreaterThan(0)
    expect(mapTiles()[0]).toContain("token=e2e-key")
    await expect(options.getByText(/^Satellite:/)).toBeVisible()
    await page.reload()
    await drawn(page)
    await page.getByRole("button", { name: "Map options" }).click()
    await expect(satellite).toHaveAttribute("aria-pressed", "true")
    // Esri needs a signal: the map goes back to the Map until it returns.
    await context.setOffline(true)
    await expect(map).toHaveAttribute("aria-pressed", "true")
    await expect(satellite).toBeDisabled()
    await context.setOffline(false)
    await expect(satellite).toHaveAttribute("aria-pressed", "true")
  })

  test("goes back to the map when Esri refuses the key", async ({ page }) => {
    await withSatellite(page, { refused: true })
    await page.goto("/explore")
    await drawn(page)
    await page.getByRole("button", { name: "Map options" }).click()
    const looks = page
      .getByRole("dialog", { name: "Map" })
      .getByRole("group", { name: "Map type" })
    await looks.getByRole("button", { name: "Satellite" }).click()
    await expect(page.getByText("Esri refused the satellite key")).toBeVisible()
    await expect(
      looks.getByRole("button", { name: "Map", exact: true })
    ).toHaveAttribute("aria-pressed", "true")
    // Still there to try again.
    await expect(looks.getByRole("button", { name: "Satellite" })).toBeEnabled()
  })

  test("goes back to the map when the imagery doesn't come", async ({
    page,
  }) => {
    await withSatellite(page, { unanswered: true })
    await page.goto("/explore")
    await drawn(page)
    await page.getByRole("button", { name: "Map options" }).click()
    await page
      .getByRole("dialog", { name: "Map" })
      .getByRole("group", { name: "Map type" })
      .getByRole("button", { name: "Satellite" })
      .click()
    await expect(
      page.getByText("Couldn't load the satellite imagery")
    ).toBeVisible()
  })

  test("has no satellite on an instance without a key", async ({ page }) => {
    await page.goto("/explore")
    await drawn(page)
    await page.getByRole("button", { name: "Map options" }).click()
    const options = page.getByRole("dialog", { name: "Map" })
    await expect(options.getByLabel("MPA zones")).toBeVisible()
    await expect(options.getByRole("group", { name: "Map type" })).toHaveCount(
      0
    )
    await expect(options.getByText(/^Satellite:/)).toHaveCount(0)
  })
})

test.describe("at desktop width", () => {
  test.use({ viewport: { width: 1024, height: 768 } })

  test("opens the rules in the card, back to where they came from", async ({
    page,
  }) => {
    await page.goto("/explore?site=a-frame")
    await drawn(page)
    const site = page.getByRole("region", { name: aFrame.name })
    await site.getByRole("button", { name: /^Boulders no-take zone/ }).click()
    const rules = page.getByRole("region", { name: "Marine protected areas" })
    await expect(
      rules.getByRole("heading", { name: "Table Mountain" })
    ).toBeVisible()
    // A long list is grouped by where on the map each rule applies.
    await expect(
      rules.getByRole("heading", { name: "No-take zones" })
    ).toBeVisible()
    // The card's views replace one another, so Back leaves Explore.
    await rules.getByRole("link", { name: aFrame.name }).click()
    await expect(site).toBeVisible()
    await site.getByRole("button", { name: /^Boulders no-take zone/ }).click()
    await page.keyboard.press("Escape")
    await expect(site).toBeVisible()
    // At the site's own MPA, for one further down the rules.
    await page.goto("/explore?site=mv-afrikaner")
    await page
      .getByRole("region", {
        name: sites.find(({ id }) => id === "mv-afrikaner")!.name,
      })
      .getByRole("button", { name: /^No diving/ })
      .click()
    await expect(
      rules.getByRole("heading", { name: "Robben Island" })
    ).toBeInViewport()
    await page.goto("/explore?site=a-frame")
    // From Map options, the rules lead back to the list.
    await site.getByRole("link", { name: "Dive sites" }).click()
    await page.getByRole("button", { name: "Map options" }).click()
    const row = page.getByRole("button", { name: "Zone rules" })
    await still(row)
    await row.click()
    await rules.getByRole("link", { name: "Dive sites" }).click()
    await expect(page.getByRole("region", { name: "Dive sites" })).toBeVisible()
  })

  test("switches to satellite from the options popover", async ({ page }) => {
    const mapTiles = await withSatellite(page)
    await page.goto("/explore")
    await drawn(page)
    await page.getByRole("button", { name: "Map options" }).click()
    const looks = page.getByRole("group", { name: "Map type" })
    await looks.getByRole("button", { name: "Satellite" }).click()
    await expect(
      looks.getByRole("button", { name: "Satellite" })
    ).toHaveAttribute("aria-pressed", "true")
    await expect.poll(() => mapTiles().length).toBeGreaterThan(0)
  })
})
