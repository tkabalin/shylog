import { expect, test, type Locator } from "@playwright/test"

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

// A screen this short sends every page past the tab bar. A page whose top
// element shrinks to the screen spills its end over the shell's bottom
// padding, where it can't be scrolled out from under the bar.
test.describe("on a short screen", () => {
  test.use({ viewport: { width: 390, height: 320 } })

  test("scrolls every page's end clear of the tab bar", async ({ page }) => {
    // Seventeen page loads in one test.
    test.slow()
    await page.goto("/")
    const cards = page.locator("main a[href^='/dive/dive-']")
    await expect(cards).toHaveCount(46)
    const dive = await cards.first().getAttribute("href")
    await page.goto("/you/entities?kind=site")
    const sites = page.locator("main a[href^='/you/entities/site/']")
    await expect(sites).toHaveCount(2)
    const site = await sites.first().getAttribute("href")
    const deleteDive = page.getByRole("button", { name: "Delete dive" })
    const none = page.getByText(/^No .+ yet\./)
    const title = page.getByRole("heading", { level: 1 })
    // Each with what shows once its content is in. The fixture has no
    // regions, people, trips, centres, cards or deleted dives, so those
    // screens are short, but a wrapper that breaks them still shows here.
    const screens = [
      ["/", cards.last()],
      [dive!, deleteDive],
      [`${dive}/edit`, deleteDive],
      ["/dive/new", page.getByText("Ignore this dive")],
      ["/you", page.getByText("Version")],
      ["/you/entities?kind=site", sites.last()],
      [site!, page.getByRole("button", { name: "Delete site" })],
      ["/you/entities?kind=region", none],
      ["/you/entities?kind=person", none],
      ["/you/entities?kind=diveCentre", none],
      ["/you/entities?kind=trip", none],
      ["/you/certifications", page.getByText("No cards yet")],
      ["/you/deleted", page.getByText("Nothing deleted")],
      ["/stats", title],
      ["/import", title],
    ] as const

    for (const [url, ready] of screens)
      await test.step(url, async () => {
        await page.goto(url)
        await expect(ready).toBeAttached()
        // The dive form hides the tab bar, so its end goes to the screen's.
        const nav = page.getByRole("navigation", { name: "Main" })
        const limit = (await nav.isVisible())
          ? (await nav.boundingBox())!.y
          : page.viewportSize()!.height
        // Polled, as the Log's months take their real height once seen.
        await expect
          .poll(() => lowestAtEnd(page.locator("#main")))
          .toBeLessThanOrEqual(limit + 0.5)
      })
  })
})

// Scrolls to the end, then finds the lowest drawn edge of the page, leaving
// out fixed and undrawn elements and anything a scroller or a fold clips.
function lowestAtEnd(main: Locator) {
  return main.evaluate((el) => {
    el.scrollTop = el.scrollHeight
    let lowest = 0
    const walk = (node: Element, clip: number) => {
      const style = getComputedStyle(node)
      if (
        style.position === "fixed" ||
        style.display === "none" ||
        style.opacity === "0"
      )
        return
      const box = node.getBoundingClientRect()
      // A hidden element's children can still be drawn.
      if (box.height > 0 && style.visibility !== "hidden")
        lowest = Math.max(lowest, Math.min(box.bottom, clip))
      const inner =
        style.overflowY === "visible" ? clip : Math.min(clip, box.bottom)
      for (const child of node.children) walk(child, inner)
    }
    for (const child of el.children) walk(child, Infinity)
    return lowest
  })
}
