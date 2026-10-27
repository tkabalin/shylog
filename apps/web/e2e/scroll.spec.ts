import { expect, test } from "@playwright/test"

import { tapCard } from "./ui"

// Month groups render with content-visibility and an estimated height, so
// check that going back from a dive lands on the same card with everything
// as it was.
for (const via of ["the Log link", "the browser"] as const) {
  test(`returns the Log to the opened card, back through ${via}`, async ({
    page,
  }) => {
    await page.goto("/")
    const main = page.locator("#main")
    const cards = page.locator("main a[href^='/dive/dive-']")
    await expect(cards).toHaveCount(46)
    await main.evaluate((el) => el.scrollTo(0, 1800))
    const bar = page.locator("[data-log-bar]")
    await expect(bar).toHaveAttribute("data-stuck", "")

    // A card well down the list, fully on screen.
    const card = cards.nth(22)
    await card.scrollIntoViewIfNeeded()
    const before = {
      top: await main.evaluate((el) => el.scrollTop),
      y: (await card.boundingBox())!.y,
      month: await page.locator("section h2").evaluateAll((headings) => {
        // The month heading stuck under the header.
        const stuck = headings.filter((h) => {
          const top = h.parentElement!.getBoundingClientRect().top
          return (
            top >= 0 &&
            top < 300 &&
            getComputedStyle(h.parentElement!).position === "sticky"
          )
        })
        return stuck.map((h) => h.textContent)
      }),
    }

    await tapCard(card)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    if (via === "the browser") await page.goBack()
    else
      await page
        .locator("header")
        .first()
        .getByRole("link", { name: "Log" })
        .click()

    await expect(page).toHaveURL("/")
    await expect(cards).toHaveCount(46)
    await expect
      .poll(() => main.evaluate((el) => el.scrollTop))
      .toBe(before.top)
    // Within a pixel, as WebKit rounds the restored scrollTop, once the
    // header has settled.
    await expect
      .poll(async () => Math.abs((await card.boundingBox())!.y - before.y))
      .toBeLessThanOrEqual(1)
    await expect(bar).toHaveAttribute("data-stuck", "")
    expect(before.month.length).toBeGreaterThan(0)
    // The stuck month draws the line under the bar at once, not after the
    // first scroll.
    await expect(page.locator("[data-month-heading][data-stuck]")).toHaveCount(
      1
    )
  })
}
