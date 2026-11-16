import { readFileSync } from "node:fs"
import { expect, test, type Locator, type Page } from "@playwright/test"

import type { Part } from "../src/map/page-text"

// The sites and their text as the refresh script wrote them, so a refresh
// that rewords a page doesn't fail these tests.
type Site = {
  id: string
  name: string
  page?: string
  depth?: number
  approximate?: true
  description?: string
}
const read = (file: string) =>
  JSON.parse(readFileSync(`${import.meta.dirname}/../src/map/${file}`, "utf8"))
const sites = (
  read("sites.geojson") as { features: { properties: Site }[] }
).features.map((feature) => feature.properties)
const pages = read("pages.json") as Record<string, Part[]>
const site = (id: string) => sites.find((each) => each.id === id)!
const text = (part: Part) => (typeof part === "string" ? part : part.text)
// Markdown as the sheet shows it, without its marks.
const plain = (markdown: string) =>
  markdown.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_]/g, "")
const firstHeading = (page: string) =>
  pages[page]
    .map(text)
    .join("\n")
    .match(/^#+ (.+)$/m)![1]
const aFrame = site("a-frame")
// The first other site A-Frame's page links to, and the words of its link.
const [, linkText, linked] = pages[aFrame.page!]
  .map(text)
  .join("\n")
  .match(/\[([^\]]+)\]\(site:((?!a-frame\))[^)]+)\)/)!
const bySite = (id: string) => (url: URL) => url.searchParams.get("site") === id

// The map is a canvas, so a pin is found from where the camera puts it.
async function drawn(page: Page) {
  const wrapper = page.locator("main div:has(> .maplibregl-map)")
  // A cold stack's first draw, with the other browser's tests running too,
  // can outlast the usual wait.
  await expect(wrapper).toHaveCSS("opacity", "1", { timeout: 15_000 })
  // Busy while the camera moves; a tap waits for it to settle.
  await expect(wrapper).not.toHaveAttribute("aria-busy", "true")
  return (await page.locator("main .maplibregl-canvas").boundingBox())!
}

// Where the sheet comes to rest, once its slides have finished: one that
// starts while another runs replaces it, so it waits again until none run.
async function resting(sheet: Locator) {
  await expect(sheet).toBeVisible()
  await sheet.evaluate(async (element) => {
    for (
      let motions = element.getAnimations();
      motions.length;
      motions = element.getAnimations()
    ) {
      await Promise.allSettled(motions.map((motion) => motion.finished))
    }
  })
  return (await sheet.boundingBox())!
}

// A drag on the sheet's grabber, as a finger would.
async function drag(page: Page, sheet: Locator, by: number) {
  const box = (await sheet.boundingBox())!
  const x = box.x + box.width / 2
  await page.mouse.move(x, box.y + 6)
  await page.mouse.down()
  // A frame a step, as a finger moves, so the sheet sees every one.
  for (let step = 1; step <= 10; step++) {
    await page.mouse.move(x, box.y + 6 + (by * step) / 10)
    await page.evaluate(() => new Promise(requestAnimationFrame))
  }
  await page.mouse.up()
}

test.describe("at phone width", () => {
  test("opens a site's sheet from the address, at its peek", async ({
    page,
  }) => {
    await page.goto("/explore?site=a-frame")
    const map = await drawn(page)
    const sheet = page.getByRole("dialog", { name: aFrame.name })
    await expect(sheet).toBeVisible()
    await expect(
      sheet.getByText("False Bay coast", { exact: true })
    ).toBeVisible()
    await expect(sheet.getByRole("definition").first()).toHaveText(
      `${aFrame.approximate ? "≈ " : ""}${aFrame.depth} m`
    )
    await expect(sheet.getByRole("definition").last()).toHaveText("Reef")
    await expect(
      sheet.getByText(aFrame.description!.slice(0, 40)).first()
    ).toBeVisible()
    await expect(
      sheet.getByText("Boulders no-take zone", { exact: true })
    ).toBeVisible()
    await expect(
      sheet.getByRole("link", { name: "Read on Wikivoyage" })
    ).toHaveAttribute(
      "href",
      `https://en.wikivoyage.org/wiki/Diving_the_Cape_Peninsula_and_False_Bay/${aFrame.page}`
    )
    // At its peek, with the page's text waiting below it.
    const box = await resting(sheet)
    expect(box.y).toBeGreaterThan(map.y + map.height / 2)
    await expect(
      sheet.getByRole("heading", { name: firstHeading(aFrame.page!) })
    ).toBeAttached()
  })

  test("picks a site with a tap near its pin, and puts it down on land", async ({
    page,
  }) => {
    await page.goto("/explore?site=a-frame")
    const map = await drawn(page)
    const sheet = page.getByRole("dialog", { name: aFrame.name })
    // The pin sits in the middle of the map the sheet leaves showing.
    const top = (await resting(sheet)).y
    const pin = { x: map.x + map.width / 2, y: (map.y + top) / 2 }
    // Simon's Town's mountainside, where no site is in reach.
    await page.mouse.click(map.x + 40, pin.y + 120)
    await expect(page).toHaveURL(/\/explore$/)
    await expect(sheet).toHaveCount(0)
    // A finger a little off the pin still picks it.
    await page.mouse.click(pin.x + 12, pin.y + 10)
    await expect(page).toHaveURL(bySite("a-frame"))
    await expect(sheet).toBeVisible()
  })

  test("keeps the site through a double tap, which zooms in", async ({
    page,
  }) => {
    await page.goto("/explore?site=a-frame")
    const map = await drawn(page)
    const sheet = page.getByRole("dialog", { name: aFrame.name })
    const top = (await resting(sheet)).y
    await page.mouse.dblclick(map.x + 40, (map.y + top) / 2 + 120)
    await drawn(page)
    // Past the 300 ms a tap waits for a second before putting the site
    // down: a later timer runs after the app's, then a frame for the router.
    await page.evaluate(
      () =>
        new Promise((done) =>
          setTimeout(() => requestAnimationFrame(done), 350)
        )
    )
    await expect(page).toHaveURL(bySite("a-frame"))
    await expect(sheet).toBeVisible()
  })

  test("raises the sheet to the page, and comes back to its summary", async ({
    page,
  }) => {
    // Several slides and a scroll, slow in WebKit under a loaded runner.
    test.slow()
    await page.goto("/explore?site=a-frame")
    const map = await drawn(page)
    const sheet = page.getByRole("dialog", { name: aFrame.name })
    const title = sheet.getByRole("heading", { name: aFrame.name, exact: true })
    const peek = (await resting(sheet)).y
    await drag(page, sheet, -500)
    expect((await resting(sheet)).y).toBeCloseTo(map.y, 0)
    // Read a way down, then lowered, it shows the summary again.
    await sheet.locator("[data-scroll-top]").evaluate((element) => {
      element.scrollTop = 1500
    })
    await expect(title).not.toBeInViewport()
    await drag(page, sheet, 300)
    expect((await resting(sheet)).y).toBeCloseTo(peek, 0)
    await expect(title).toBeInViewport()
  })

  test("opens a site from a link in the text, at its peek", async ({
    page,
  }) => {
    test.slow()
    await page.goto("/explore?site=a-frame")
    const map = await drawn(page)
    const sheet = page.getByRole("dialog", { name: aFrame.name })
    await resting(sheet)
    await drag(page, sheet, -500)
    await resting(sheet)
    // Far down the text, which opens the site at the top of its own.
    await sheet
      .getByRole("link", { name: plain(linkText) })
      .first()
      .click()
    await expect(page).toHaveURL(bySite(linked))
    const next = page.getByRole("dialog", { name: site(linked).name })
    expect((await resting(next)).y).toBeGreaterThan(map.y + map.height / 2)
    await expect(
      next.getByRole("heading", { name: site(linked).name, exact: true })
    ).toBeInViewport()
    // Dragged down past its peek, it puts the site down.
    await drag(page, next, 300)
    await expect(page).toHaveURL(/\/explore$/)
    await expect(next).toHaveCount(0)
  })

  test("keeps a site with no page at its peek, with no link", async ({
    page,
  }) => {
    const pageless = sites.find((each) => !each.page)!
    await page.goto(`/explore?site=${pageless.id}`)
    await drawn(page)
    const sheet = page.getByRole("dialog", { name: pageless.name })
    const peek = (await resting(sheet)).y
    await expect(sheet.getByRole("link", { name: /Wikivoyage/ })).toHaveCount(0)
    await drag(page, sheet, -300)
    expect((await resting(sheet)).y).toBeCloseTo(peek, 0)
  })

  test("puts a shared page's site first, then the page", async ({ page }) => {
    const pinnacle = site("whittle-rock/west-pinnacle")
    const own = pages[pinnacle.page!].find(
      (part) => typeof part === "object" && part.sites.includes(pinnacle.id)
    )!
    await page.goto(`/explore?site=${pinnacle.id}`)
    const sheet = page.getByRole("dialog", { name: pinnacle.name })
    await expect(sheet).toBeVisible()
    // Its own words, then the page under the page's name.
    const words = sheet
      .locator("p")
      .filter({ hasText: plain(text(own)).slice(0, 30) })
      .last()
    const heading = sheet.getByRole("heading", {
      name: pinnacle.page,
      exact: true,
    })
    await expect(heading).toBeAttached()
    const [first, then] = await Promise.all(
      [words, heading].map((each) =>
        each.evaluate((element) => element.getBoundingClientRect().y)
      )
    )
    expect(first).toBeLessThan(then)
  })

  test("marks a depth read from words, and shows none where words aren't enough", async ({
    page,
  }) => {
    const approximate = sites.find((each) => each.approximate)!
    const none = sites.find((each) => each.depth === undefined)!
    await page.goto(`/explore?site=${approximate.id}`)
    const depth = page.getByRole("dialog").getByRole("definition").first()
    await expect(depth).toHaveText(`≈ ${approximate.depth} m`)
    await page.goto(`/explore?site=${none.id}`)
    await expect(depth).toHaveText("–")
  })
})

test.describe("at desktop width", () => {
  test.use({ viewport: { width: 1024, height: 768 } })

  test("opens a site in a card over the map's left side", async ({ page }) => {
    await page.goto("/explore?site=a-frame")
    const map = await drawn(page)
    const card = page.getByRole("region", { name: aFrame.name })
    const box = (await card.boundingBox())!
    expect(box.x).toBeCloseTo(map.x + 12, 0)
    expect(box.width).toBe(360)
    // As tall as the summary, so the map shows below it.
    expect(box.y + box.height).toBeLessThan(map.y + map.height - 200)
    const understand = card.getByRole("heading", {
      name: firstHeading(aFrame.page!),
    })
    await expect(understand).toHaveCount(0)
    await card.getByRole("button", { name: "Read more" }).click()
    await expect(understand).toBeVisible()
    expect((await card.boundingBox())!.height).toBeCloseTo(map.height - 24, 0)
    await card.getByRole("button", { name: "Read less" }).click()
    await expect(understand).toHaveCount(0)
    // The breadcrumb's first crumb puts the site down, as the close does.
    await card.getByRole("link", { name: "Explore" }).click()
    await expect(page).toHaveURL(/\/explore$/)
    await expect(card).toHaveCount(0)
    await page.goto("/explore?site=a-frame")
    await card.getByRole("button", { name: "Close" }).click()
    await expect(page).toHaveURL(/\/explore$/)
  })

  test("widens the card from its edge, and keeps the width", async ({
    page,
  }) => {
    await page.goto("/explore?site=a-frame")
    await drawn(page)
    const card = page.getByRole("region", { name: aFrame.name })
    const edge = page.getByRole("separator", { name: "Resize" })
    await edge.focus()
    await page.keyboard.press("ArrowRight")
    await page.keyboard.press("ArrowRight")
    await expect.poll(async () => (await card.boundingBox())!.width).toBe(392)
    // No narrower than it starts.
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowLeft")
    await expect.poll(async () => (await card.boundingBox())!.width).toBe(360)
    await page.keyboard.press("ArrowRight")
    await page.reload()
    await expect.poll(async () => (await card.boundingBox())!.width).toBe(376)
  })

  test("leaves out Read more for a site with no page", async ({ page }) => {
    const pageless = sites.find((each) => !each.page)!
    await page.goto(`/explore?site=${pageless.id}`)
    await drawn(page)
    const card = page.getByRole("region", { name: pageless.name })
    await expect(
      card.getByRole("heading", { name: pageless.name, exact: true })
    ).toBeVisible()
    await expect(card.getByRole("button", { name: "Read more" })).toHaveCount(0)
    await expect(card.getByRole("link", { name: /Wikivoyage/ })).toHaveCount(0)
  })

  test("puts the site down with Escape", async ({ page }) => {
    await page.goto("/explore?site=a-frame")
    await drawn(page)
    await expect(page.getByRole("region", { name: aFrame.name })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page).toHaveURL(/\/explore$/)
  })
})
