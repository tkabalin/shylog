import { expect, test, type Page } from "@playwright/test"

// The map is a canvas, so a pin is found from where the camera puts it.
async function drawn(page: Page) {
  const wrapper = page.locator("main div:has(> .maplibregl-map)")
  await expect(wrapper).toHaveCSS("opacity", "1")
  // Busy while the camera moves; a tap waits for it to settle.
  await expect(wrapper).not.toHaveAttribute("aria-busy", "true")
  return (await page.locator("main .maplibregl-canvas").boundingBox())!
}

test.describe("at phone width", () => {
  test("picks a site with a tap near its pin, and puts it down on land", async ({
    page,
  }) => {
    // The address opens a site with its pin in the middle of the map.
    await page.goto("/explore?site=a-frame")
    const map = await drawn(page)
    const pin = { x: map.x + map.width / 2, y: map.y + map.height / 2 }
    // Simon's Town's mountainside, where no site is in reach.
    await page.mouse.click(map.x + 40, pin.y + 120)
    await expect(page).toHaveURL(/\/explore$/)
    // A finger a little off the pin still picks it.
    await page.mouse.click(pin.x + 12, pin.y + 10)
    await expect(page).toHaveURL(/\/explore\?site=a-frame$/)
  })

  test("keeps the site through a double tap, which zooms in", async ({
    page,
  }) => {
    await page.goto("/explore?site=a-frame")
    const map = await drawn(page)
    await page.mouse.dblclick(map.x + 40, map.y + map.height / 2 + 120)
    await drawn(page)
    // Past the 300 ms a tap waits for a second before putting the site
    // down: a later timer runs after the app's, then a frame for the router.
    await page.evaluate(
      () =>
        new Promise((done) =>
          setTimeout(() => requestAnimationFrame(done), 350)
        )
    )
    await expect(page).toHaveURL(/\/explore\?site=a-frame$/)
  })
})
