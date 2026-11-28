import { readdirSync } from "node:fs"
import { expect, test, type Locator } from "@playwright/test"

import {
  atUnknownSite,
  deleteCard,
  diveId,
  getLog,
  putCard,
  test as withData,
} from "./api"
import { png } from "./png"
import { still } from "./ui"

const tabs = ["Log", "Statistics", "Explore", "Import", "You"]

async function height(locator: Locator) {
  const box = await locator.boundingBox()
  return box?.height ?? 0
}

test.describe("at phone width", () => {
  test("keeps Offline storage on You", async ({ page }) => {
    await page.goto("/you")
    await expect(
      page.getByRole("button", { name: /^Offline storage/ })
    ).toBeVisible()
  })

  test("shows the five tabs in a bottom nav and no sidebar", async ({
    page,
  }) => {
    await page.goto("/")
    const nav = page.getByRole("navigation", { name: "Main" })
    await expect(nav).toHaveCount(1)
    // Icons only: each tab is named by its aria-label, with no visible text.
    await expect(nav.getByRole("link")).toHaveCount(tabs.length)
    for (const tab of tabs) {
      await expect(nav.getByRole("link", { name: tab })).toBeVisible()
    }
    await expect(nav).toHaveText("")
    expect(await height(nav.getByRole("link").first())).toBeGreaterThanOrEqual(
      44
    )
    await expect(page.locator("[data-slot=sidebar]")).toBeHidden()

    const box = await nav.boundingBox()
    expect(box!.y + box!.height).toBeCloseTo(844, 0)

    await nav.getByRole("link", { name: "Statistics" }).click()
    await expect(page).toHaveURL("/stats")
    await expect(nav.getByRole("link", { name: "Statistics" })).toHaveAttribute(
      "aria-current",
      "page"
    )
    await expect(nav.getByRole("link", { name: "Log" })).not.toHaveAttribute(
      "aria-current",
      "page"
    )
  })

  // The server writes SHYLOG_EXPLORE into the page; Vite's page is rewritten
  // here as the server would for an instance with it off.
  test("leaves Explore out on an instance with it off", async ({ page }) => {
    // The two pages it opens, not every module Vite serves.
    const pages = ["/", "/explore"]
    await page.route(
      (url) => pages.includes(url.pathname),
      async (route) => {
        // Once more where the server closed the kept-alive socket as it was reused.
        const response = await route.fetch({ maxRetries: 1 })
        const body = (await response.text()).replace(
          '<meta name="shylog-explore" content="on"',
          '<meta name="shylog-explore" content="off"'
        )
        await route.fulfill({ response, body })
      }
    )
    await page.goto("/")
    const nav = page.getByRole("navigation", { name: "Main" })
    const links = nav.getByRole("link")
    await expect(links).toHaveCount(tabs.length - 1)
    await expect(nav.getByRole("link", { name: "Explore" })).toHaveCount(0)
    // The four share the bar's width evenly.
    const bar = (await nav.boundingBox())!
    const widths = await links.evaluateAll((all) =>
      all.map((link) => link.getBoundingClientRect().width)
    )
    for (const width of widths) {
      expect(width).toBeCloseTo((bar.width - 16) / widths.length, 0)
    }
    // An old link or bookmark opens the Log instead.
    await page.goto("/explore?site=a-frame")
    await expect(page).toHaveURL("/")
    await expect(page.locator(".maplibregl-map")).toHaveCount(0)
  })

  // Find what is too wide instead of hiding it behind overflow-x: clip.
  test("does not scroll sideways", async ({ page }) => {
    await page.goto("/")
    const main = page.locator("main")
    const overflow = await main.evaluate(
      (el) => el.scrollWidth - el.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test("scrolls the content, not the page, and resets it on navigation", async ({
    page,
  }) => {
    await page.goto("/")
    const main = page.locator("main")
    // A fresh browser shows the Log's skeleton until the first sync, and
    // WebKit drops the scroll as the dives replace it.
    await expect(main.locator("a[href^='/dive/dive-']").first()).toBeVisible()
    await main.evaluate((el) => {
      el.append(
        Object.assign(document.createElement("div"), {
          style: "height: 3000px; flex: none",
        })
      )
      el.scrollTop = 500
    })
    expect(await main.evaluate((el) => el.scrollTop)).toBe(500)
    expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(
      0
    )

    const nav = page.getByRole("navigation", { name: "Main" })
    const box = await nav.boundingBox()
    expect(box!.y + box!.height).toBeCloseTo(844, 0)

    await nav.getByRole("link", { name: "Statistics" }).click()
    await expect(page).toHaveURL("/stats")
    await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBe(0)
  })

  test("shows the bottom nav's top line only while content is under it", async ({
    page,
  }) => {
    await page.goto("/stats")
    const nav = page.getByRole("navigation", { name: "Main" })
    const main = page.locator("main")
    await expect(
      page.getByRole("heading", { name: "Sites", exact: true })
    ).toBeAttached()
    // Hide the screen, so the page starts too short to scroll.
    await main.evaluate((el) => {
      for (const child of el.children)
        (child as HTMLElement).style.display = "none"
    })
    // The line is the nav's ::before, faded by opacity.
    const line = () =>
      nav.evaluate((el) => getComputedStyle(el, "::before").opacity)
    const none = "0"

    // Too short to scroll
    await expect.poll(line).toBe(none)

    await main.evaluate((el) => {
      el.append(
        Object.assign(document.createElement("div"), {
          style: "height: 3000px; flex: none",
        })
      )
    })
    await expect.poll(line).not.toBe(none)

    await main.evaluate((el) => (el.scrollTop = el.scrollHeight))
    await expect.poll(line).toBe(none)
  })

  // Import's bar of dive computer buttons sits on the nav, so content never
  // runs under the nav there: the bar takes the line, or the two drew a
  // double line.
  test("gives Import's bottom bar the line instead of the nav", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 520 })
    await page.goto("/import")
    await expect(
      page.getByRole("button", { name: "Detect dive computer" })
    ).toBeVisible()
    const nav = page.getByRole("navigation", { name: "Main" })
    const bar = page.locator(".bottom-bar")
    const main = page.locator("main")
    const line = (el: Element) => getComputedStyle(el, "::before").opacity
    const none = "0"

    await expect.poll(() => bar.evaluate(line)).not.toBe(none)
    expect(await nav.evaluate(line)).toBe(none)

    await main.evaluate((el) => (el.scrollTop = el.scrollHeight))
    await expect.poll(() => bar.evaluate(line)).toBe(none)
    expect(await nav.evaluate(line)).toBe(none)
  })

  // Without the cable Import has no bar, so the nav keeps its own line.
  test("leaves the nav its line on Import without the cable", async ({
    page,
  }) => {
    await page.route("**/api/dive-computer", (route) =>
      route.fulfill({ json: { enabled: false, computer: null } })
    )
    // A fresh browser starts with downloading off, so the stub's answer
    // has to land first, or this would pass without it.
    const answered = page.waitForResponse("**/api/dive-computer")
    await page.goto("/import")
    await answered
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("shylog-dive-computer"))
      )
      .toContain('"enabled":false')
    await expect(page.getByText("Import a Subsurface file")).toBeVisible()
    await expect(page.locator(".bottom-bar")).toHaveCount(0)
    const nav = page.getByRole("navigation", { name: "Main" })
    expect(
      await nav.evaluate((el) => getComputedStyle(el, "::before").animationName)
    ).not.toBe("none")
  })

  test("switches tabs in place, so back never steps through them", async ({
    page,
  }) => {
    await page.goto("/")
    const nav = page.getByRole("navigation", { name: "Main" })
    for (const [tab, heading] of [
      ["Statistics", "Statistics"],
      ["You", "You"],
      ["Log", "Log"],
    ]) {
      await nav.getByRole("link", { name: tab }).click()
      await expect(
        page.getByRole("heading", { name: heading, exact: true })
      ).toBeAttached()
    }
    await page.goBack()
    expect(page.url()).not.toMatch(/\/(stats|you)$/)
  })

  test("fills Explore with the map between the status bar and the tabs", async ({
    page,
  }) => {
    await page.goto("/")
    const nav = page.getByRole("navigation", { name: "Main" })
    await nav.getByRole("link", { name: "Explore" }).click()
    await expect(page).toHaveURL("/explore")
    await expect(
      page.getByRole("heading", { name: "Explore", exact: true })
    ).toBeAttached()
    const map = page.locator("main .maplibregl-canvas")
    await expect(map).toBeVisible()
    // Shown once its land has drawn.
    await expect(page.locator("main div:has(> .maplibregl-map)")).toHaveCSS(
      "opacity",
      "1"
    )
    const box = (await map.boundingBox())!
    const bar = (await nav.boundingBox())!
    expect(box.y).toBeCloseTo(12, 0)
    expect(box.y + box.height).toBeCloseTo(bar.y, 0)
    // A finger pinches, so a phone has no zoom buttons.
    await expect(page.getByRole("group", { name: "Zoom" })).toHaveCount(0)
    // The map takes every drag, so the page never scrolls behind it.
    const main = page.locator("main")
    expect(
      await main.evaluate((el) => el.scrollHeight - el.clientHeight)
    ).toBeLessThanOrEqual(0)
  })

  test("folds the map's credit to its info button", async ({ page }) => {
    await page.goto("/explore")
    const credit = page.locator(".maplibregl-ctrl-attrib")
    // Compact once the style names its sources, and folded from the start.
    await expect(credit).toHaveClass(/maplibregl-compact\b/)
    // There once the extract's header is read, and still folded. Not by
    // role, which can't find a hidden link at all.
    const osm = credit.locator('a[href="https://openstreetmap.org/copyright"]')
    await expect(osm).toBeAttached()
    await expect(osm).toBeHidden()
    // A 24px button that a finger a little off its edge still opens.
    const button = (await page.getByLabel("Toggle attribution").boundingBox())!
    expect(button.width).toBe(24)
    await page.mouse.click(button.x - 8, button.y + button.height / 2)
    await expect(osm).toBeVisible()
  })

  test("says the map isn't downloaded when it can't load, and tries again", async ({
    page,
  }) => {
    await page.route(/basemap[\w-]*\.pmtiles$/, (route) => route.abort())
    await page.goto("/explore")
    await expect(
      page.getByText("The map isn't downloaded yet", { exact: true })
    ).toBeVisible()
    // No map behind it: without the land, the zones would show their
    // shapes ashore.
    await expect(page.locator(".maplibregl-map")).toHaveCount(0)
    await page.unroute(/basemap[\w-]*\.pmtiles$/)
    await page.getByRole("button", { name: "Try again" }).click()
    await expect(page.locator("main div:has(> .maplibregl-map)")).toHaveCSS(
      "opacity",
      "1"
    )
  })

  test("reads the map's extract by range in the built app @built", async ({
    page,
  }) => {
    const errors: Error[] = []
    page.on("pageerror", (error) => errors.push(error))
    // A tile's range, past the header and root directory read first.
    const tile = page.waitForResponse(
      (res) =>
        /\/assets\/basemap-[\w-]+\.pmtiles$/.test(res.url()) &&
        res.status() === 206 &&
        !res.request().headers()["range"]?.startsWith("bytes=0-")
    )
    await page.goto("/explore")
    await tile
    await expect(page.locator("main div:has(> .maplibregl-map)")).toHaveCSS(
      "opacity",
      "1"
    )
    // The service worker keeps Explore's chunk (the map and the sites),
    // the map's worker and the dive sites' page text with the app.
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const urls: string[] = []
            for (const key of await caches.keys()) {
              const cache = await caches.open(key)
              urls.push(...(await cache.keys()).map((req) => req.url))
            }
            return [
              /\/explore-map-[\w-]+\.js/,
              /\/maplibre-gl-worker-[\w-]+\.js/,
              /\/pages-[\w-]+\.json/,
            ]
              .map((pattern) => urls.some((url) => pattern.test(url)))
              .join()
          }),
        { timeout: 15_000 }
      )
      .toBe("true,true,true")
    expect(errors).toEqual([])
  })

  test("draws the map with no signal once the app has kept it @built", async ({
    page,
    context,
  }) => {
    await page.goto("/")
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
        timeout: 15_000,
      })
      .toBe(true)
    // The app downloads the extract at launch, before Explore is opened.
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const cache = await caches.open("map-extract")
            return (await cache.keys()).length
          }),
        { timeout: 30_000 }
      )
      .toBe(1)
    await context.setOffline(true)
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Explore" })
      .click()
    await expect(page.locator("main div:has(> .maplibregl-map)")).toHaveCSS(
      "opacity",
      "1",
      { timeout: 15_000 }
    )
  })

  test("shows a site's map with no signal once the app has kept the images @built", async ({
    page,
    context,
  }) => {
    // Every map and thumbnail, about 48 MB from the local server, then the
    // waits for the worker before and the viewer after.
    test.setTimeout(180_000)
    const count = readdirSync(`${import.meta.dirname}/../src/map/images`).length
    await page.goto("/")
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
        timeout: 15_000,
      })
      .toBe(true)
    // The app downloads them at launch, before Explore is opened.
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const cache = await caches.open("map-images")
            return (await cache.keys()).length
          }),
        { timeout: 90_000 }
      )
      .toBe(count)
    await context.setOffline(true)
    await page.goto("/explore?site=a-frame&image=0")
    const viewer = page.getByRole("dialog", {
      name: "Maps and images of A-Frame",
    })
    await expect
      .poll(
        () =>
          viewer
            .getByRole("img")
            .first()
            .evaluate((image: HTMLImageElement) => image.naturalWidth),
        { timeout: 15_000 }
      )
      .toBeGreaterThan(0)
  })

  test("sends the old Settings address to You", async ({ page }) => {
    await page.goto("/settings")
    await expect(page).toHaveURL(/\/you$/)
  })

  test("sizes controls for touch and inputs at 16px", async ({ page }) => {
    await page.goto("/dev/ui")
    const controls = [
      page.getByRole("button", { name: "Save" }),
      page.getByRole("textbox", { name: "Site" }),
      page.getByRole("combobox", { name: "Water" }),
      page.getByRole("link", { name: "Partridge Point" }),
    ]
    for (const control of controls) {
      expect(await height(control)).toBeGreaterThanOrEqual(44)
    }
    await expect(page.getByRole("textbox", { name: "Site" })).toHaveCSS(
      "font-size",
      "16px"
    )
  })
})

test.describe("at desktop width", () => {
  test.use({ viewport: { width: 1024, height: 768 } })

  test("shows the tabs in a sidebar and no bottom nav", async ({ page }) => {
    await page.goto("/")
    const nav = page.getByRole("navigation", { name: "Main" })
    await expect(nav).toHaveCount(1)
    await expect(nav.getByRole("link")).toHaveText(tabs)
    await expect(page.locator("[data-slot=sidebar]")).toBeVisible()

    await nav.getByRole("link", { name: "Import" }).click()
    await expect(page).toHaveURL("/import")
    const current = nav.locator("[data-active]")
    await expect(current).toHaveText("Import")
    await expect(current).toHaveAttribute("aria-current", "page")
  })

  test("runs the map from the sidebar to the window's edges", async ({
    page,
  }) => {
    await page.goto("/explore")
    const map = page.locator("main .maplibregl-canvas")
    await expect(map).toBeVisible()
    const box = (await map.boundingBox())!
    const sidebar = (await page
      .locator("[data-slot=sidebar-container]")
      .boundingBox())!
    expect(box.x).toBeCloseTo(sidebar.x + sidebar.width, 0)
    expect(box.y).toBe(0)
    expect(box.x + box.width).toBeCloseTo(1024, 0)
    expect(box.y + box.height).toBeCloseTo(768, 0)
    // A mouse has no pinch: zoom buttons, bottom right above the credit.
    const zoom = page.getByRole("group", { name: "Zoom" })
    const buttons = (await zoom.boundingBox())!
    const credit = (await page.getByLabel("Toggle attribution").boundingBox())!
    expect(buttons.y + buttons.height).toBeLessThan(credit.y)
    // The credit as wide as the buttons, its ring included, and under them.
    expect(credit.width).toBe(32)
    expect(buttons.x + buttons.width / 2).toBeCloseTo(
      credit.x + credit.width / 2,
      0
    )
    await expect(page.locator("main div:has(> .maplibregl-map)")).toHaveCSS(
      "opacity",
      "1"
    )
    const before = await page.locator("main .maplibregl-map").screenshot()
    await zoom.getByRole("button", { name: "Zoom in" }).click()
    await expect
      .poll(async () =>
        Buffer.compare(
          before,
          await page.locator("main .maplibregl-map").screenshot()
        )
      )
      .not.toBe(0)
  })

  test("picks the Statistics year from a menu", async ({ page }) => {
    await page.goto("/stats")
    await page.getByRole("combobox", { name: "Year, All time" }).click()
    await page.getByRole("option", { name: "2025" }).click()
    await expect(page).toHaveURL("/stats?year=2025")
    await expect(page.locator("header").first()).toContainText("2dives in")
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })

  test("shows You's tools in the centred column under a breadcrumb", async ({
    page,
  }) => {
    for (const [path, title] of [
      ["/you/best-mix", "Best nitrox mix"],
      ["/you/ndl", "NDL table"],
    ]) {
      await page.goto(path)
      const crumbs = page.getByRole("navigation", { name: "breadcrumb" })
      await expect(crumbs.getByRole("link", { name: "You" })).toBeVisible()
      await expect(crumbs).toContainText(title!)
      const table = page.getByRole("table")
      await expect(table).toBeVisible()
      const box = (await table.boundingBox())!
      // 36rem, less the column's 1rem sides.
      expect(box.width).toBeCloseTo(544, 0)
    }
  })

  test("edits the packing list from header buttons, asking before leaving with changes", async ({
    page,
  }) => {
    await page.goto("/you/packing")
    await page.getByRole("button", { name: "Edit", exact: true }).click()
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible()
    await page.getByRole("button", { name: "Delete BCD" }).click()
    const nav = page.getByRole("navigation", { name: "Main" })
    await nav.getByRole("link", { name: "Log" }).click()
    await expect(page.getByText("Discard changes?")).toBeVisible()
    await page.getByRole("button", { name: "Keep editing" }).click()
    await expect(page).toHaveURL("/you/packing")
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByRole("checkbox", { name: "BCD" })).toBeVisible()
  })

  // On a stack of its own, as two detects at once would find the cable
  // busy.
  test("detects the dive computer on Import @writes", async ({ page }) => {
    await page.goto("/import")
    await page.getByRole("button", { name: "Detect dive computer" }).click()
    await expect(page.getByText("Suunto D4i", { exact: true })).toBeVisible()
    // With a mouse the buttons stay under the watch, with no bottom bar.
    const download = page.getByRole("button", { name: "Download dives" })
    await expect(download).toBeVisible()
    await expect(page.locator(".bottom-bar")).toHaveCount(0)
    const row = await page.getByText("Import a Subsurface file").boundingBox()
    expect((await download.boundingBox())!.y).toBeLessThan(row!.y)
  })

  test("moves the crosshair to the safety stop with a click", async ({
    page,
  }) => {
    await page.goto(`/dive/${await diveId(page.request, 54)}`)
    const events = page.getByRole("region", { name: "Events" })
    await events.getByRole("button", { name: /^Safety stop/ }).click()
    const readout = page.locator("[data-slot=readout]").first()
    await expect(readout).toContainText("at 19:40")
    await expect(readout).toContainText("Safety stop")
  })

  test("opens a sheet as a dialog over the content", async ({ page }) => {
    await page.goto("/dive/new")
    await page.getByRole("button", { name: /^Surface interval/ }).click()
    const dialog = page.getByRole("dialog", { name: "Surface interval" })
    await expect(dialog).toBeVisible()
    await expect(page.locator("[data-slot=drawer-swipe-handle]")).toHaveCount(0)
    // Centred beside the sidebar, over the form.
    const box = (await dialog.boundingBox())!
    const main = (await page.locator("#main").boundingBox())!
    expect(box.x + box.width / 2).toBeCloseTo(main.x + main.width / 2, 0)

    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
  })

  test("browses Explore's dive sites in the site picker's dialog, and goes back", async ({
    page,
  }) => {
    await page.goto("/dive/new")
    await page.getByRole("button", { name: /^Site,/ }).click()
    const dialog = page.getByRole("dialog", { name: "Site" })
    await dialog.getByRole("button", { name: "From Explore" }).click()
    const sites = page.getByRole("dialog", { name: "Dive sites" })
    await expect(
      sites.getByRole("heading", { name: "Fresh water" })
    ).toBeAttached()
    // Back sits in the footer, as the dialog's other views have it.
    await sites.getByRole("button", { name: "Sites", exact: true }).click()
    await expect(
      dialog.getByRole("button", { name: "New custom site" })
    ).toBeVisible()
  })

  test("folds the sidebar to a rail of icons, and keeps it folded", async ({
    page,
    browserName,
  }) => {
    await page.goto("/dive/new")
    const sidebar = page.locator("[data-slot=sidebar-container]")
    await expect(sidebar).toHaveCSS("width", "256px")
    await page.getByRole("button", { name: "Collapse sidebar" }).click()
    await expect(sidebar).toHaveCSS("width", "48px")
    // Each icon is named in a tooltip beside it.
    const nav = page.getByRole("navigation", { name: "Main" })
    await nav.getByRole("link", { name: "Statistics" }).hover()
    await expect(page.locator("[data-slot=tooltip-content]")).toHaveText(
      "Statistics"
    )
    // A dialog centres beside the rail, over the form.
    await page.getByRole("button", { name: /^Surface interval/ }).click()
    const dialog = page.getByRole("dialog", { name: "Surface interval" })
    await still(dialog)
    const box = (await dialog.boundingBox())!
    const main = (await page.locator("#main").boundingBox())!
    expect(box.x + box.width / 2).toBeCloseTo(main.x + main.width / 2, 0)
    // The shortcut leaves the sidebar alone under a dialog. WebKit runs as
    // Safari on a Mac, which takes ⌘B; Chromium as Windows, Ctrl+B.
    const shortcut = browserName === "webkit" ? "Meta+b" : "Control+b"
    await page.keyboard.press(shortcut)
    await expect(sidebar).toHaveCSS("width", "48px")
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(sidebar).toHaveCSS("width", "48px")

    await page.reload()
    await expect(sidebar).toHaveCSS("width", "48px")
    await page.keyboard.press(shortcut)
    await expect(sidebar).toHaveCSS("width", "256px")
    await expect(
      page.getByRole("button", { name: "Collapse sidebar" })
    ).toBeVisible()
  })

  test("leaves Offline storage to phones", async ({ page }) => {
    await page.goto("/you")
    // This device is there, with its other rows, but no Offline storage.
    await expect(
      page.getByText("Smooth water temperature", { exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: /^Offline storage/ })
    ).toHaveCount(0)
  })

  test("starts a trip from a bar button and picks its dives in a dialog", async ({
    page,
  }) => {
    await page.goto("/you/entities?kind=trip")
    await page.getByRole("link", { name: "New trip" }).click()
    await expect(page).toHaveURL("/you/entities/trip/new")
    await page.getByRole("button", { name: "Choose dives" }).click()
    const dialog = page.getByRole("dialog", { name: "Choose dives" })
    await expect(dialog).toBeVisible()
    // The bar's actions sit in the dialog's footer, as shadcn's do.
    await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible()
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await expect(dialog).toBeHidden()
  })

  test("asks before leaving a new trip with a name typed", async ({ page }) => {
    await page.goto("/you/entities?kind=trip")
    await page.getByRole("link", { name: "New trip" }).click()
    await page.getByLabel("Name").fill("Unsaved trip")
    await page.getByRole("link", { name: "Trips", exact: true }).click()
    const ask = page.getByRole("dialog", { name: "Discard changes?" })
    await expect(ask).toBeVisible()
    await ask.getByRole("button", { name: "Keep editing" }).click()
    await expect(page).toHaveURL("/you/entities/trip/new")
    await expect(page.getByLabel("Name")).toHaveValue("Unsaved trip")

    await page.getByRole("link", { name: "Trips", exact: true }).click()
    await ask.getByRole("button", { name: "Discard changes" }).click()
    await expect(page).toHaveURL(/\/you\/entities\?kind=trip/)
  })

  test("picks a choice from a select below its row", async ({ page }) => {
    await page.goto("/dive/new")
    const type = page.getByRole("combobox", { name: /^Type,/ })
    await type.click()
    const list = page.getByRole("listbox")
    await expect(list).toBeVisible()
    await list.getByRole("option", { name: "Training" }).click()
    await expect(list).toBeHidden()
    await expect(type).toHaveAccessibleName("Type, Training")
    // No sheet opened for it.
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })

  test("moves between the Log, a dive and its form by header buttons", async ({
    page,
  }) => {
    await page.goto("/")
    const card = page.locator("#main a[href^='/dive/dive-']").first()
    const dive = (await card.getAttribute("href"))!
    await card.click()
    await expect(page).toHaveURL(dive)
    // Once the dive has loaded, so the router knows the Log is behind it.
    await expect(page.getByRole("link", { name: "Edit" })).toBeVisible()

    // Pushed from the Log, so the breadcrumb pops back to it.
    await page.getByRole("link", { name: "Log", exact: true }).last().click()
    await expect(page).toHaveURL("/")
    await page.goForward()
    await expect(page).toHaveURL(dive)

    await page.getByRole("link", { name: "Edit" }).click()
    await expect(page).toHaveURL(`${dive}/edit`)
    await page.goBack()
    await expect(page).toHaveURL(dive)

    await page.goto("/")
    await page.getByRole("link", { name: "New dive" }).click()
    await expect(page).toHaveURL("/dive/new")
    await page.goBack()
    await expect(page).toHaveURL("/")
  })

  test("asks before the sidebar leaves a form with something typed", async ({
    page,
  }) => {
    await page.goto("/dive/new")
    await page.getByRole("textbox", { name: "Weight" }).fill("6")
    const log = page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Log" })
    const ask = page.getByRole("dialog", { name: "Discard changes?" })

    await log.click()
    await expect(ask).toBeVisible()
    await ask.getByRole("button", { name: "Keep editing" }).click()
    await expect(ask).toBeHidden()
    await expect(page).toHaveURL("/dive/new")

    await log.click()
    await ask.getByRole("button", { name: "Discard changes" }).click()
    await expect(page).toHaveURL("/")
  })

  test("moves through You's screens by breadcrumbs", async ({ page }) => {
    await page.goto("/you")
    await page.getByRole("link", { name: /^Sites/ }).click()
    await expect(page).toHaveURL("/you/entities?kind=site")
    const site = page.locator("#main a[href^='/you/entities/site/']").first()
    const href = (await site.getAttribute("href"))!
    await site.click()
    await expect(page).toHaveURL(href)
    // The site's Save is the header's filled button, off until an edit.
    await expect(
      page.getByRole("button", { name: "Save", exact: true })
    ).toBeDisabled()
    const crumbs = page.getByRole("navigation", { name: "breadcrumb" })
    await expect(crumbs.locator("[aria-current=page]")).toHaveText(
      (await page.getByRole("heading", { level: 1 }).textContent())!
    )

    // Pushed from the list, so each breadcrumb pops back to it.
    await crumbs.getByRole("link", { name: "Sites" }).click()
    await expect(page).toHaveURL("/you/entities?kind=site")
    await crumbs.getByRole("link", { name: "You" }).click()
    await expect(page).toHaveURL("/you")
    await page.goForward()
    await expect(page).toHaveURL("/you/entities?kind=site")
  })

  test("picks a site's region and body of water from selects", async ({
    page,
  }) => {
    await page.goto("/you/entities?kind=site")
    await page.locator("#main a[href^='/you/entities/site/']").first().click()
    const body = page.getByRole("combobox", { name: /^Body of water,/ })
    await body.click()
    await page.getByRole("option", { name: "Lake or quarry" }).click()
    await expect(body).toHaveAccessibleName("Body of water, Lake or quarry")
    // The water follows the body, as in the sheet.
    await expect(page.getByRole("button", { name: "Fresh" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(page.getByRole("combobox", { name: /^Region,/ })).toBeVisible()
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })

  test("asks before the sidebar leaves an entity with an edit", async ({
    page,
  }) => {
    await page.goto("/you/entities?kind=site")
    const site = page.locator("#main a[href^='/you/entities/site/']").first()
    const url = (await site.getAttribute("href"))!
    await site.click()
    await expect(page).toHaveURL(url)
    const name = page.getByRole("textbox", { name: "Name" })
    await name.fill("Somewhere else")
    const log = page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Log" })
    const ask = page.getByRole("dialog", { name: "Discard changes?" })

    await log.click()
    await ask.getByRole("button", { name: "Keep editing" }).click()
    await expect(ask).toBeHidden()
    await expect(page).toHaveURL(url)
    await expect(name).toHaveValue("Somewhere else")

    await log.click()
    await ask.getByRole("button", { name: "Discard changes" }).click()
    await expect(page).toHaveURL("/")
  })

  test("types the surface interval in boxes", async ({ page }) => {
    await page.goto("/dive/new")
    const row = page.getByRole("button", { name: /^Surface interval/ })
    await row.click()
    await page.getByRole("textbox", { name: "Hours" }).fill("1")
    await page.getByRole("textbox", { name: "Minutes" }).fill("45")
    await page.getByRole("button", { name: "Done" }).click()
    await expect(row).toHaveAccessibleName("Surface interval, 1 h 45 min")

    // Past the 48 h cap the box shows what's saved; Enter is Done.
    await row.click()
    await page.getByRole("textbox", { name: "Hours" }).fill("48")
    const minutes = page.getByRole("textbox", { name: "Minutes" })
    await minutes.fill("30")
    await expect(minutes).toHaveValue("0")
    await minutes.press("Enter")
    await expect(row).toHaveAccessibleName("Surface interval, 48 h 0 min")
  })

  test("picks the date and time from popovers", async ({ page }) => {
    await page.goto("/dive/new")
    const date = page.getByRole("button", { name: /^Date,/ })
    await date.click()
    await page.getByRole("button", { name: /, 15 \w+ \d{4}/ }).click()
    await expect(date).toHaveAccessibleName(/^Date, \w{3} 15 /)
    // It opens on the picked day, so the arrows move from there.
    await date.click()
    await page.keyboard.press("ArrowLeft")
    await page.keyboard.press("Enter")
    await expect(date).toHaveAccessibleName(/^Date, \w{3} 14 /)

    // An empty time opens at 09:00, and each column sets it at once.
    const time = page.getByRole("button", { name: /^Start time,/ })
    await time.click()
    await expect(time).toHaveAccessibleName("Start time, 09:00")
    const minutes = page.getByRole("listbox", { name: "Minutes" })
    await minutes.focus()
    await page.keyboard.press("ArrowDown")
    await page
      .getByRole("listbox", { name: "Hours" })
      .getByRole("option", { name: "14" })
      .click()
    await page.keyboard.press("Escape")
    await expect(time).toHaveAccessibleName("Start time, 14:01")
  })

  test("returns controls to compact sizes", async ({ page }) => {
    await page.goto("/dev/ui")
    expect(await height(page.getByRole("button", { name: "Save" }))).toBe(32)
    await expect(page.getByRole("textbox", { name: "Site" })).toHaveCSS(
      "font-size",
      "14px"
    )
  })
})

// Wider than 48rem but under a finger, so it keeps the phone's chrome.
test.describe("on a phone turned landscape", () => {
  // WebKit can't emulate a coarse pointer.
  test.skip(({ browserName }) => browserName !== "chromium")
  test.use({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  })

  test("keeps the bottom nav and touch sizes", async ({ page }) => {
    await page.goto("/dev/ui")
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible()
    await expect(page.locator("[data-slot=sidebar]")).toBeHidden()
    expect(
      await height(page.getByRole("button", { name: "Save" }))
    ).toBeGreaterThanOrEqual(44)
    await expect(page.getByRole("textbox", { name: "Site" })).toHaveCSS(
      "font-size",
      "16px"
    )
  })
})

test("follows the system dark setting", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" })
  await page.goto("/")
  await expect(page.locator("html")).not.toHaveClass(/dark/)
  const light = await page
    .locator("body")
    .evaluate((body) => getComputedStyle(body).backgroundColor)

  const themeColor = page.locator('meta[name="theme-color"]')
  await expect(themeColor).toHaveAttribute("content", light)

  await page.emulateMedia({ colorScheme: "dark" })
  await expect(page.locator("html")).toHaveClass(/dark/)
  const dark = await page
    .locator("body")
    .evaluate((body) => getComputedStyle(body).backgroundColor)
  expect(dark).not.toBe(light)
  await expect(themeColor).toHaveAttribute("content", dark)
})

// Evidence for review, not baselines: the folder is gitignored.
test.describe("screenshots", () => {
  test.skip(({ browserName }) => browserName !== "chromium")

  for (const width of [390, 1024]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${width} ${colorScheme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 768 })
        await page.emulateMedia({ colorScheme })
        await page.goto("/")
        await expect(
          page.getByRole("navigation", { name: "Main" })
        ).toBeVisible()
        await page.screenshot({
          // Beside this file, whichever directory Playwright runs from
          path: `${import.meta.dirname}/__screenshots__/shell-${width}-${colorScheme}.png`,
        })
      })
    }
  }
})

withData.describe("the Unknown site at desktop width", () => {
  withData.use({ viewport: { width: 1024, height: 768 } })

  withData(
    "shows no Save, details or actions @writes",
    async ({ page, restore }) => {
      const { siteId: id } = await atUnknownSite(page.request, restore)
      await page.goto(`/you/entities/site/${id}`)
      await expect(
        page.getByText("Imported dives with no site wait here.")
      ).toBeVisible()
      await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0)
      await expect(page.getByRole("combobox")).toHaveCount(0)
      await expect(page.getByRole("button", { name: /^Merge/ })).toHaveCount(0)
      await expect(page.getByRole("button", { name: /^Delete/ })).toHaveCount(0)
    }
  )
})

withData.describe("certification cards at desktop width", () => {
  withData.use({ viewport: { width: 1024, height: 768 } })

  withData(
    "adds from the bar, edits over the viewer, and drags without a hold @writes",
    async ({ page, restore }) => {
      const id = `card-desk${Date.now().toString(36)}`
      restore((request) => deleteCard(request, id))
      await putCard(page.request, id, "Desk card", [
        png(300, 400, [30, 60, 120]),
        png(400, 300, [240, 240, 245]),
      ])
      const before = (await getLog(page.request)).cards.find(
        (one) => one.id === id
      )!

      await page.goto("/you/certifications")
      await expect(
        page.locator("header").getByRole("button", { name: "Add card" })
      ).toBeVisible()

      await page.getByRole("link", { name: /^Desk card/ }).click()
      const viewer = page.getByRole("dialog", { name: "Desk card" })
      await viewer.getByRole("button", { name: "Edit card" }).click()
      const edit = page.getByRole("dialog", { name: "Edit card" })
      await still(edit)
      // The viewer covers the sidebar, so the dialog centres on the window.
      const box = (await edit.boundingBox())!
      expect(box.x + box.width / 2).toBeCloseTo(512, 0)

      // A mouse drags a page at once, with no long press first.
      const first = (await edit.locator("img").first().boundingBox())!
      const at: [number, number] = [
        first.x + first.width / 2,
        first.y + first.height / 2,
      ]
      await page.mouse.move(...at)
      await page.mouse.down()
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(at[0] + i * 20, at[1])
        await page.waitForTimeout(30)
      }
      await page.mouse.up()
      await edit.getByRole("button", { name: "Save" }).click()
      await expect(edit).toBeHidden()
      await expect
        .poll(
          async () =>
            (await getLog(page.request)).cards.find((one) => one.id === id)
              ?.images
        )
        .toEqual([...before.images].reverse())
    }
  )

  withData(
    "zooms a card's thumbnail with a slider in a dialog over the viewer @writes",
    async ({ page, restore }) => {
      const id = `card-deskcrop${Date.now().toString(36)}`
      restore((request) => deleteCard(request, id))
      await putCard(page.request, id, "Desk crop", [
        png(300, 600, [30, 60, 120]),
      ])

      await page.goto(`/you/certifications/${id}`)
      await page.getByRole("button", { name: "Edit card" }).click()
      const edit = page.getByRole("dialog", { name: "Edit card" })
      await still(edit)
      await edit.getByRole("button", { name: "Thumbnail" }).click()
      const crop = page.getByRole("dialog", { name: "Thumbnail" })
      await still(crop)
      // Over the viewer, as Edit card is, so it centres on the window.
      const box = (await crop.boundingBox())!
      expect(box.x + box.width / 2).toBeCloseTo(512, 0)

      // A plain wheel zooms, and Reset is on only once there's a zoom to
      // undo. The slider is off until the page loads, as the wheel is.
      const slider = crop.getByRole("slider", { name: "Zoom" })
      const reset = crop.getByRole("button", { name: "Reset" })
      await expect(slider).toBeEnabled()
      await expect(reset).toBeDisabled()
      // Over the frame's centre, so the zoom adds no pan.
      const stage = (await crop
        .locator("[data-base-ui-swipe-ignore]")
        .boundingBox())!
      await page.mouse.move(
        stage.x + stage.width / 2,
        stage.y + stage.height / 2
      )
      await page.mouse.wheel(0, -200)
      await expect(reset).toBeEnabled()
      expect(
        Number(await slider.getAttribute("aria-valuenow"))
      ).toBeGreaterThan(1)
      await reset.click()
      await expect(reset).toBeDisabled()
      // Settled, as the slider stops a Reset where it is.
      await expect(slider).toHaveAttribute("aria-valuenow", "1")

      // The slider zooms all the way in, about the frame's centre.
      await slider.press("End")
      await crop.getByRole("button", { name: "Done" }).click()
      await expect(crop).toBeHidden()
      await edit.getByRole("button", { name: "Save" }).click()
      await expect(edit).toBeHidden()
      await expect
        .poll(
          async () =>
            (await getLog(page.request)).cards.find((one) => one.id === id)
              ?.thumb
        )
        .toMatchObject({ x: 0.5, y: 0.5, scale: 8, aspect: 0.5 })
    }
  )
})
