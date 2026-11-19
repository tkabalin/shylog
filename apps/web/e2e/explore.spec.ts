import { readFileSync } from "node:fs"
import { expect, test, type Locator, type Page } from "@playwright/test"

import type { Part } from "../src/map/page-text"
import { coloursStatusBar, still } from "./ui"

// The sites and their text as the refresh script wrote them, so a refresh
// that rewords a page doesn't fail these tests.
type Site = {
  id: string
  name: string
  type: "reef" | "wreck" | "fresh"
  page?: string
  depth?: number
  approximate?: true
  description?: string
  access?: "shore" | "boat" | "both"
  wind?: string[]
  noSpecialSkills?: true
  needs?: string[]
  goodFor?: string[]
}
const read = (file: string) =>
  JSON.parse(readFileSync(`${import.meta.dirname}/../src/map/${file}`, "utf8"))
const sites = (
  read("sites.geojson") as { features: { properties: Site }[] }
).features.map((feature) => feature.properties)
const pages = read("pages.json") as Record<string, Part[]>
const site = (id: string) => sites.find((each) => each.id === id)!
// Each site's maps and images, and the caption each was shown with.
const images = read("images.json") as {
  sites: Record<string, string[]>
  files: Record<string, { caption: string }>
}
const captions = (id: string) =>
  images.sites[id].map((file) => images.files[file].caption)
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
// Text that is all of an element's own.
const whole = (words: string) =>
  new RegExp(`^${words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
// The first heading inside a page's first section, shown once it opens.
const firstSubheading = (page: string) =>
  pages[page]
    .map(text)
    .join("\n")
    .split(/^(?=## )/m)
    .find((section) => section.startsWith("## "))!
    .match(/^### (.+)$/m)![1]
// The page's section a piece of its text is in, which folds.
const sectionOf = (page: string, words: string) =>
  pages[page]
    .map(text)
    .join("\n")
    .split(/^(?=## )/m)
    .find((section) => section.includes(words))!
    .match(/^## (.+)$/m)![1]

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

// The server writes the instance's ArcGIS key into the page; Vite's page is
// rewritten here as the server would, and Esri's tiles answered with a
// stand-in, so the map's requests for them can be counted.
async function withSatellite(
  page: Page,
  { refused = false, unanswered = false } = {}
) {
  const pages = ["/", "/explore"]
  await page.route(
    (url) => pages.includes(url.pathname),
    async (route) => {
      const response = await route.fetch()
      const body = (await response.text()).replace(
        '<meta name="shylog-arcgis-key" content=""',
        '<meta name="shylog-arcgis-key" content="e2e-key"'
      )
      await route.fulfill({ response, body })
    }
  )
  const tiles: string[] = []
  await page.route(/ibasemaps-api\.arcgis\.com/, (route) => {
    tiles.push(route.request().url())
    if (unanswered) return route.abort()
    // Esri refuses a key with a 200 and the error as JSON.
    return refused
      ? route.fulfill({
          contentType: "text/plain",
          body: '{"error":{"code":498,"message":"Invalid token.","details":[]}}',
        })
      : route.fulfill({ contentType: "image/png", body: tile })
  })
  // The map's own, not the Satellite card's picture.
  return () => tiles.filter((url) => !url.includes("/tile/13/4924/4515?"))
}
// A grey 1 px PNG.
const tile = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNoAAAAggCBd81ytgAAAABJRU5ErkJggg==",
  "base64"
)

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
  test("comes back to the map drawn, with no sea while it's built", async ({
    page,
  }) => {
    await page.goto("/explore")
    await drawn(page)
    const nav = page.getByRole("navigation", { name: "Main" })
    await nav.getByRole("link", { name: "Log" }).click()
    await expect(page.locator(".maplibregl-map")).toHaveCount(0)
    await nav.getByRole("link", { name: "Explore" }).click()
    // Shown on the first frame the page has it, not after a fade from sea.
    const opacity = await page.evaluate(
      () =>
        new Promise<string>((done) => {
          const look = () => {
            const wrapper = document.querySelector(
              "main div:has(> .maplibregl-map)"
            )
            if (wrapper) done(getComputedStyle(wrapper).opacity)
            else requestAnimationFrame(look)
          }
          look()
        })
    )
    expect(opacity).toBe("1")
  })

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
    await expect(sheet.getByText(/Diving allowed\./)).toBeVisible()
    // Read more after the whole description, and Wikivoyage, which needs
    // signal, after the text, which doesn't.
    await expect(sheet.getByRole("button", { name: "Read more" })).toHaveText(
      "Read more"
    )
    // Not clamped when whole, as iOS drew its ellipsis after Read more.
    await expect(
      sheet.locator("p", {
        has: page.getByRole("button", { name: "Read more" }),
      })
    ).toHaveCSS("-webkit-line-clamp", "none")
    await expect(
      sheet.getByRole("link", { name: "Read on Wikivoyage" })
    ).not.toBeInViewport()
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

  // A chosen site is a sub-screen, not a filter, so its tab goes back to
  // the bare map rather than only scrolling to the top.
  test("closes the site on a tap of Explore's own tab", async ({ page }) => {
    await page.goto("/explore?site=a-frame")
    await drawn(page)
    const sheet = page.getByRole("dialog", { name: aFrame.name })
    await expect(sheet).toBeVisible()
    // The camera goes back to the coast too, so it moves.
    const moved = page.evaluate(
      () =>
        new Promise<boolean>((done) => {
          const wrapper = document.querySelector(
            "main div:has(> .maplibregl-map)"
          )!
          new MutationObserver(() => {
            if (wrapper.getAttribute("aria-busy") === "true") done(true)
          }).observe(wrapper, { attributeFilter: ["aria-busy"] })
        })
    )
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Explore" })
      .click()
    await expect(page).toHaveURL(/\/explore$/)
    await expect(sheet).toBeHidden()
    expect(await moved).toBe(true)
  })

  // The list and the rules are a level deeper too, so the tab closes them
  // as their Back does; filters stay, as the Log's do on its tab.
  test("goes to Explore's root on its own tab, keeping the filters", async ({
    page,
  }) => {
    const tab = page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Explore" })
    await page.goto("/explore?site=a-frame&types=reef")
    await drawn(page)
    await tab.click()
    await expect(page).toHaveURL(
      (url) => !url.searchParams.has("site") && /types=reef/.test(url.search)
    )
    await page.getByRole("button", { name: /^List of \d+ sites$/ }).click()
    const list = page.getByRole("region", { name: "Dive sites" })
    await expect(list).toBeVisible()
    await tab.click()
    await expect(list).toHaveCount(0)
    await expect(page).toHaveURL(
      (url) => !url.searchParams.has("view") && /types=reef/.test(url.search)
    )
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
    await sheet
      .getByRole("button", { name: firstHeading(aFrame.page!) })
      .click()
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
      .getByRole("button", { name: sectionOf(aFrame.page!, linkText) })
      .click()
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

  test("goes back to the site a link came from, raised where it was", async ({
    page,
  }) => {
    test.slow()
    await page.goto("/")
    // Its code loaded first: WebKit reloads a lazy route left mid-import.
    await expect(page.getByRole("heading", { name: "Log" })).toBeAttached()
    await page.goto("/explore?site=a-frame")
    const map = await drawn(page)
    const sheet = page.getByRole("dialog", { name: aFrame.name })
    await resting(sheet)
    await sheet.getByRole("button", { name: "Read more" }).click()
    await resting(sheet)
    // Far enough down the text that it has scrolled.
    await sheet
      .getByRole("button", { name: firstHeading(aFrame.page!) })
      .click()
    await sheet
      .getByRole("button", { name: sectionOf(aFrame.page!, linkText) })
      .click()
    const link = sheet.getByRole("link", { name: plain(linkText) }).first()
    await link.scrollIntoViewIfNeeded()
    const scroller = sheet.locator("[data-scroll-top]")
    const read = await scroller.evaluate((element) => element.scrollTop)
    expect(read).toBeGreaterThan(0)
    await link.click()
    const next = page.getByRole("dialog", { name: site(linked).name })
    await resting(next)
    // In place of the area line, back to A-Frame, raised at the same place.
    await next.getByRole("link", { name: aFrame.name }).first().click()
    await expect(page).toHaveURL(bySite("a-frame"))
    expect((await resting(sheet)).y).toBeCloseTo(map.y, 0)
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollTop))
      .toBeCloseTo(read, 0)
    await expect(
      sheet.getByText("False Bay coast", { exact: true })
    ).toBeAttached()
    // Each step replaced the address, so Back leaves Explore.
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
  })

  test("folds the page's sections, and shows the name once the title's gone", async ({
    page,
  }) => {
    await page.goto("/explore?site=a-frame")
    await drawn(page)
    const sheet = page.getByRole("dialog", { name: aFrame.name })
    await resting(sheet)
    await sheet.getByRole("button", { name: "Read more" }).click()
    await resting(sheet)
    await expect(sheet.getByRole("button", { name: "Read more" })).toHaveCount(
      0
    )
    const understand = sheet.getByRole("button", {
      name: firstHeading(aFrame.page!),
    })
    await expect(understand).toHaveAttribute("aria-expanded", "false")
    const position = sheet.getByRole("heading", {
      name: firstSubheading(aFrame.page!),
    })
    await expect(position).toHaveCount(0)
    await understand.click()
    await expect(understand).toHaveAttribute("aria-expanded", "true")
    await expect(position).toBeVisible()
    // A bar with the name stands in for the title scrolled away, and goes
    // as it comes back; its close puts the site down.
    const bar = sheet.locator("p").filter({ hasText: whole(aFrame.name) })
    const scroll = (top: number) =>
      sheet.locator("[data-scroll-top]").evaluate((element, top) => {
        element.scrollTop = top
      }, top)
    await expect(bar).toBeHidden()
    await scroll(600)
    await expect(bar).toBeVisible()
    await scroll(0)
    await expect(bar).toBeHidden()
    await scroll(600)
    await expect(bar).toBeVisible()
    await sheet.getByRole("link", { name: "Close" }).first().click()
    await expect(page).toHaveURL(/\/explore$/)
  })

  test("ends the way back when a site is reached any other way", async ({
    page,
  }) => {
    test.slow()
    await page.goto("/explore?site=a-frame")
    const map = await drawn(page)
    const sheet = page.getByRole("dialog", { name: aFrame.name })
    await resting(sheet)
    await sheet.getByRole("button", { name: "Read more" }).click()
    await resting(sheet)
    await sheet
      .getByRole("button", { name: sectionOf(aFrame.page!, linkText) })
      .click()
    await sheet
      .getByRole("link", { name: plain(linkText) })
      .first()
      .click()
    const next = page.getByRole("dialog", { name: site(linked).name })
    const top = (await resting(next)).y
    const backRow = next.getByRole("link", { name: aFrame.name }).first()
    await expect(backRow).toBeVisible()
    // Put down, then picked again from its pin, it has its area line back.
    await next.getByRole("link", { name: "Close" }).first().click()
    await expect(next).toHaveCount(0)
    await drawn(page)
    await page.mouse.click(map.x + map.width / 2, (map.y + top) / 2)
    await expect(page).toHaveURL(bySite(linked))
    await resting(next)
    await expect(backRow).toHaveCount(0)
  })

  test("clamps a long description at the peek, and shows it all raised", async ({
    page,
  }) => {
    const long = [...sites].sort(
      (a, b) => (b.description?.length ?? 0) - (a.description?.length ?? 0)
    )[0]
    await page.goto(`/explore?site=${long.id}`)
    await drawn(page)
    const sheet = page.getByRole("dialog", { name: long.name })
    await resting(sheet)
    const description = sheet
      .locator("p")
      .filter({ hasText: long.description!.slice(0, 30) })
      .first()
    const clamped = (await description.boundingBox())!.height
    expect(clamped).toBeLessThanOrEqual(3 * 21)
    // Over the end of the cut line, as the one after the words is hidden.
    await expect(sheet.getByRole("button", { name: "Read more" })).toHaveText(
      "more"
    )
    await sheet.getByRole("button", { name: "Read more" }).click()
    await resting(sheet)
    expect((await description.boundingBox())!.height).toBeGreaterThan(clamped)
  })

  test("can't open Wikivoyage with no signal", async ({ page, context }) => {
    await page.goto("/explore?site=a-frame")
    await drawn(page)
    const sheet = page.getByRole("dialog", { name: aFrame.name })
    await resting(sheet)
    // The text in hand first, so the only offline icon is the summary's.
    await expect(
      sheet.getByRole("heading", { name: firstHeading(aFrame.page!) })
    ).toBeAttached()
    await context.setOffline(true)
    await expect(
      sheet.getByRole("img", { name: "Offline" }).first()
    ).toBeVisible()
    const wikivoyage = sheet.getByRole("link", { name: "Read on Wikivoyage" })
    await expect(wikivoyage).toHaveAttribute("aria-disabled", "true")
    await expect(wikivoyage).not.toHaveAttribute("href")
    await context.setOffline(false)
    await expect(wikivoyage).toHaveAttribute("href", /wikivoyage\.org/)
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
    // Named for a part of the reef, it says which reef.
    await expect(
      sheet.getByText(`Offshore False Bay · ${pinnacle.page}`)
    ).toBeVisible()
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

  test("titles the zone row No diving where diving is banned", async ({
    page,
  }) => {
    await page.goto("/explore?site=anvil-rock/anvil-rock-caves")
    const sheet = page.getByRole("dialog")
    await expect(sheet.getByText("No diving", { exact: true })).toBeVisible()
    await expect(
      sheet.getByText(/Cape Point abalone area\. No snorkelling/)
    ).toBeVisible()
    // Robben Island's restricted zone, and shore dives only off Cape Point.
    await page.goto("/explore?site=mv-afrikaner")
    await expect(sheet.getByText("No diving", { exact: true })).toBeVisible()
    await expect(
      sheet.getByText(/Robben Island restricted zone\./)
    ).toBeVisible()
    await page.goto("/explore?site=bordjiesrif")
    await expect(
      sheet.getByText("Shore dives only", { exact: true })
    ).toBeVisible()
  })

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
    await list.getByRole("combobox", { name: "Type, Any type" }).click()
    await page.getByRole("option", { name: "Wrecks" }).click()
    await page.keyboard.press("Escape")
    const wrecks = sites.filter(({ type }) => type === "wreck").length
    await expect(list.getByRole("listitem")).toHaveCount(wrecks)
    // The search looks among the wrecks alone.
    const search = list.getByRole("textbox", { name: "Search sites" })
    await search.fill("rock")
    await expect(list.getByRole("listitem")).toHaveCount(
      sites.filter(({ type, name }) => type === "wreck" && /rock/i.test(name))
        .length
    )
    await search.fill("")
    await page.goBack()
    await expect(list).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: `List of ${wrecks} sites` })
    ).toBeVisible()
    await expect(page).toHaveURL(/types=wreck/)
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
    await list.getByRole("combobox", { name: "Type, Any type" }).click()
    await page.getByRole("option", { name: "Wrecks" }).click()
    await page.keyboard.press("Escape")
    // The map's entry under the list still had A-Frame, a reef.
    await page.goBack()
    await expect(list).toHaveCount(0)
    await expect(page).toHaveURL(/types=wreck/)
    await expect(page).not.toHaveURL(bySite("a-frame"))
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })

  test("filters the map by type, and puts down a site it hides", async ({
    page,
  }) => {
    await page.goto("/explore?site=a-frame")
    await drawn(page)
    await page.getByRole("combobox", { name: "Type, Any type" }).click()
    await page.getByRole("option", { name: "Wrecks" }).click()
    // The menu stays open while you tick.
    await page.getByRole("option", { name: "Fresh water" }).click()
    await page.keyboard.press("Escape")
    await expect(
      page.getByRole("combobox", { name: "Type, Wrecks, Fresh water" })
    ).toHaveText(/Wrecks \+ 1/)
    const count = sites.filter(({ type }) => type !== "reef").length
    await expect(
      page.getByRole("button", { name: `List of ${count} sites` })
    ).toBeVisible()
    await expect(page).toHaveURL(/types=wreck%2Cfresh|types=wreck,fresh/)
    // A-Frame is a reef, so it went down with the filter.
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

  // Night dives from the shore, a site dived both ways included.
  const nightFromShore = sites.filter(
    ({ goodFor, access }) =>
      goodFor?.includes("night") && (access === "shore" || access === "both")
  ).length

  test("filters on the page tags from one sheet", async ({ page }) => {
    await page.goto("/explore")
    await drawn(page)
    await page.getByRole("button", { name: "Filters", exact: true }).click()
    const sheet = page.getByRole("dialog", { name: "Filters" })
    await still(sheet)
    await sheet.getByRole("button", { name: "Night dives" }).click()
    await sheet.getByRole("button", { name: "From shore" }).click()
    // Reset clears the sheet's own ticks before they're applied.
    await sheet.getByRole("button", { name: "Reset" }).click()
    await expect(sheet.getByRole("button", { name: "Reset" })).toBeDisabled()
    await sheet.getByRole("button", { name: "Night dives" }).click()
    await sheet.getByRole("button", { name: "From shore" }).click()
    await sheet
      .getByRole("button", { name: `Show ${nightFromShore} sites` })
      .click()
    await expect(sheet).toBeHidden()
    await expect(page).toHaveURL(/good=night/)
    await expect(page).toHaveURL(/access=shore/)
    await expect(
      page.getByRole("button", { name: "Filters, 2 set", exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: `List of ${nightFromShore} sites` })
    ).toBeVisible()
  })

  test("opens with the page tags from the address, ticked in the sheet", async ({
    page,
  }) => {
    await page.goto("/explore?good=night&access=shore")
    await drawn(page)
    await expect(
      page.getByRole("button", { name: `List of ${nightFromShore} sites` })
    ).toBeVisible()
    await page.getByRole("button", { name: "Filters, 2 set" }).click()
    const sheet = page.getByRole("dialog", { name: "Filters" })
    await still(sheet)
    await expect(
      sheet.getByRole("button", { name: "Night dives" })
    ).toHaveAttribute("aria-pressed", "true")
    await expect(
      sheet.getByRole("button", { name: "From shore" })
    ).toHaveAttribute("aria-pressed", "true")
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

  test("opens a site's map full screen, and Back closes it", async ({
    page,
  }) => {
    await page.goto("/explore?site=a-frame")
    await drawn(page)
    const sheet = page.getByRole("dialog", { name: aFrame.name })
    await resting(sheet)
    await drag(page, sheet, -500)
    await resting(sheet)
    const [first, second] = captions("a-frame")
    await sheet
      .getByRole("list", { name: "Maps and images" })
      .getByRole("button", { name: first, exact: true })
      .click()
    const viewer = page.getByRole("dialog", {
      name: `Maps and images of ${aFrame.name}`,
    })
    await expect(
      viewer.getByRole("img", { name: first, exact: true })
    ).toBeVisible()
    await expect(viewer.getByText(first, { exact: true })).toBeVisible()
    expect(await coloursStatusBar(viewer)).toBe(true)
    // The credit links to the picture's own page on Commons.
    await expect(
      viewer
        .getByRole("link", { name: "Wikimedia Commons" })
        .filter({ visible: true })
    ).toHaveAttribute("href", /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
    // The words under each image take the same room, so nothing moves.
    const dots = viewer.getByRole("tablist", { name: "Maps and images" })
    const before = (await dots.boundingBox())!.y
    await page.keyboard.press("ArrowRight")
    await expect(viewer.getByText(second, { exact: true })).toBeVisible()
    expect((await dots.boundingBox())!.y).toBe(before)
    // The address follows, so a reload opens the same image.
    await expect(page).toHaveURL((url) => url.searchParams.get("image") === "1")
    await page.goBack()
    await expect(viewer).toHaveCount(0)
    await expect(page).toHaveURL(bySite("a-frame"))
    await expect(
      sheet.getByRole("list", { name: "Maps and images" })
    ).toBeInViewport()
    // Escape closes it too, and the sheet under it keeps its site.
    await sheet
      .getByRole("list", { name: "Maps and images" })
      .getByRole("button", { name: first, exact: true })
      .click()
    await expect(viewer).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(viewer).toHaveCount(0)
    await expect(page).toHaveURL(
      (url) => bySite("a-frame")(url) && !url.searchParams.has("image")
    )
    await expect(sheet).toBeVisible()
  })

  test("turns the page on a swipe after iOS took a finger away", async ({
    page,
  }) => {
    await page.goto("/explore?site=a-frame&image=0")
    const viewer = page.getByRole("dialog", {
      name: `Maps and images of ${aFrame.name}`,
    })
    const stage = viewer.locator(".touch-none").first()
    await expect(stage).toBeVisible()
    // A finger goes down and is never let go, as when a swipe from the
    // screen's edge is the system's; then the next finger swipes alone.
    const scales = await stage.evaluate(async (element) => {
      element.setPointerCapture = () => {}
      const fire = (type: string, id: number, x: number) =>
        element.dispatchEvent(
          new PointerEvent(type, {
            pointerId: id,
            clientX: x,
            clientY: 400,
            isPrimary: true,
            pointerType: "touch",
            bubbles: true,
          })
        )
      const frame = () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done))
        )
      const box = element.querySelector("img")!.parentElement!
      fire("pointerdown", 1, 195)
      await frame()
      fire("pointerdown", 2, 300)
      const seen: string[] = []
      for (let x = 280; x >= 60; x -= 20) {
        fire("pointermove", 2, x)
        await frame()
        seen.push(box.style.transform)
      }
      fire("pointerup", 2, 60)
      return seen
    })
    // A swipe, not a pinch against the finger left behind.
    expect(scales.filter((each) => /scale\((?!1\))/.test(each))).toEqual([])
    await expect(page).toHaveURL((url) => url.searchParams.get("image") === "1")
  })

  test.describe("on an iPhone", () => {
    test.use({ hasTouch: true })

    // iOS's back swipe from the left edge would take the viewer away, as
    // it would the card viewer, so a touch starting there is cancelled.
    test("blocks the edge swipe back in the viewer", async ({ page }) => {
      await page.addInitScript(() => {
        // Only iOS's Safari has it.
        Object.defineProperty(navigator, "standalone", { value: false })
        const seen: boolean[] = []
        Object.assign(window, { seen })
        addEventListener(
          "touchstart",
          (event) => setTimeout(() => seen.push(event.defaultPrevented)),
          { capture: true }
        )
      })
      await page.goto("/explore?site=a-frame&image=0")
      const viewer = page.getByRole("dialog", {
        name: `Maps and images of ${aFrame.name}`,
      })
      await expect(viewer).toBeVisible()
      await page.touchscreen.tap(10, 400)
      await expect
        .poll(() =>
          page.evaluate(() => (window as unknown as { seen: boolean[] }).seen)
        )
        .toEqual([true])
      await expect(viewer).toBeVisible()
    })
  })

  test("hides the row for a site whose page shows no maps", async ({
    page,
  }) => {
    const bare = sites.find((each) => each.page && !images.sites[each.id])!
    // Only once both lists have come does no row mean no images. Fetches
    // only: Vite's module requests for their URLs match the names too.
    const fetched = (name: string) =>
      page.waitForResponse(
        (response) =>
          response.request().resourceType() === "fetch" &&
          response.url().includes(name)
      )
    const lists = [fetched("/images.json"), fetched("/image-credits.json")]
    await page.goto(`/explore?site=${encodeURIComponent(bare.id)}`)
    for (const list of lists) await (await list).finished()
    // And a render with them.
    for (let frame = 0; frame < 2; frame++) {
      await page.evaluate(() => new Promise(requestAnimationFrame))
    }
    await drawn(page)
    const sheet = page.getByRole("dialog", { name: bare.name })
    await resting(sheet)
    await expect(
      sheet.getByRole("list", { name: "Maps and images" })
    ).toHaveCount(0)
  })

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

  test("filters on today's wind from the Conditions pill", async ({ page }) => {
    await page.goto("/explore")
    await drawn(page)
    await page.getByRole("button", { name: "Conditions", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Conditions" })
    await still(dialog)
    await dialog
      .getByRole("group", { name: "Today's wind" })
      .getByRole("button", { name: "South-east" })
      .click()
    const count = sites.filter(({ wind }) => wind?.includes("se")).length
    await dialog.getByRole("button", { name: `Show ${count} sites` }).click()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/wind=se/)
    const card = page.getByRole("region", { name: "Dive sites" })
    await expect(
      card.getByText(`${count} sites`, { exact: true })
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
      card.getByText(`${count} sites`, { exact: true })
    ).toBeVisible()
  })

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
    // The breadcrumb's first crumb puts the site down, back to the list,
    // as the close does.
    await card.getByRole("link", { name: "Dive sites" }).click()
    await expect(page).toHaveURL(/\/explore$/)
    await expect(card).toHaveCount(0)
    await page.goto("/explore?site=a-frame")
    await card.getByRole("button", { name: "Close" }).click()
    await expect(page).toHaveURL(/\/explore$/)
  })

  test("opens a site's images from the card, and Escape closes them", async ({
    page,
  }) => {
    await page.goto("/explore?site=a-frame")
    await drawn(page)
    const card = page.getByRole("region", { name: aFrame.name })
    const strip = card.getByRole("list", { name: "Maps and images" })
    await card.getByRole("button", { name: "Read more" }).click()
    const [first] = captions("a-frame")
    await strip.getByRole("button", { name: first, exact: true }).click()
    const viewer = page.getByRole("dialog", {
      name: `Maps and images of ${aFrame.name}`,
    })
    await expect(
      viewer.getByRole("img", { name: first, exact: true })
    ).toBeVisible()
    await expect(page).toHaveURL((url) => url.searchParams.get("image") === "0")
    await page.keyboard.press("Escape")
    await expect(viewer).toHaveCount(0)
    await expect(page).toHaveURL((url) => !url.searchParams.has("image"))
    await expect(card).toBeVisible()
    // The thumbnails go with the text.
    await card.getByRole("button", { name: "Read less" }).click()
    await expect(strip).toHaveCount(0)
  })

  test("goes back to the site a link in the card came from", async ({
    page,
  }) => {
    await page.goto("/explore?site=a-frame")
    await drawn(page)
    const card = page.getByRole("region", { name: aFrame.name })
    await card.getByRole("button", { name: "Read more" }).click()
    await card
      .getByRole("button", { name: sectionOf(aFrame.page!, linkText) })
      .click()
    const link = card.getByRole("link", { name: plain(linkText) }).first()
    await link.scrollIntoViewIfNeeded()
    const scroller = card.locator("[data-scroll-top]")
    const read = await scroller.evaluate((element) => element.scrollTop)
    await link.click()
    const next = page.getByRole("region", { name: site(linked).name })
    await expect(next.getByRole("button", { name: "Read more" })).toBeVisible()
    await next.getByRole("link", { name: aFrame.name }).first().click()
    await expect(page).toHaveURL(bySite("a-frame"))
    // Its text open again, with the section left open.
    await expect(card.getByRole("button", { name: "Read less" })).toBeVisible()
    await expect(
      card.getByRole("button", { name: sectionOf(aFrame.page!, linkText) })
    ).toHaveAttribute("aria-expanded", "true")
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollTop))
      .toBeCloseTo(read, 0)
  })

  test("dims Read on Wikivoyage in the card with no signal", async ({
    page,
    context,
  }) => {
    await page.goto("/explore?site=a-frame")
    await drawn(page)
    const card = page.getByRole("region", { name: aFrame.name })
    // A button drawn as a link, which with no signal is a plain disabled one.
    const wikivoyage = card.getByRole("button", { name: "Read on Wikivoyage" })
    await expect(wikivoyage).toHaveAttribute("href", /wikivoyage\.org/)
    await context.setOffline(true)
    await expect(card.getByRole("img", { name: "Offline" })).toBeVisible()
    await expect(wikivoyage).toBeDisabled()
    await expect(wikivoyage).not.toHaveAttribute("href")
    await context.setOffline(false)
    await expect(wikivoyage).toHaveAttribute("href", /wikivoyage\.org/)
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

  test("lists the sites in a card that folds to its search", async ({
    page,
  }) => {
    await page.goto("/explore")
    const map = await drawn(page)
    const card = page.getByRole("region", { name: "Dive sites" })
    // The window's height, 12 px in.
    expect((await card.boundingBox())!.height).toBeCloseTo(map.height - 24, 0)
    await expect(card.getByText(`${sites.length} sites`)).toBeVisible()
    await card.getByRole("button", { name: "Hide the list" }).click()
    const row = card.getByRole("button", { name: /^A-Frame/ })
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
