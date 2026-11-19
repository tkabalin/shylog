import { expect, test } from "@playwright/test"

import {
  aFrame,
  bySite,
  captions,
  drag,
  drawn,
  images,
  resting,
  sites,
} from "./explore"
import { coloursStatusBar } from "./ui"

// A site's maps and images, in its strip and full screen.

test.describe("at phone width", () => {
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
})

test.describe("at desktop width", () => {
  test.use({ viewport: { width: 1024, height: 768 } })

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
})
