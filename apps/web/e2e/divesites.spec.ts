import { expect, test } from "@playwright/test"

import { aFrame, byBoat, drawn, sites } from "./explore"

// Cape Town Dive Sites, the public dive site map: Explore alone at the
// address's root, built as it's deployed, with no server behind it.

test.describe("the public dive site map @divesites", () => {
  test("draws the map with nothing of the app's server", async ({ page }) => {
    const asked: string[] = []
    page.on("request", (request) => asked.push(new URL(request.url()).pathname))
    await page.goto("/")
    // Shown only once the land has drawn, from the tile files.
    await drawn(page)
    await expect(page).toHaveTitle("Cape Town Dive Sites")
    expect(
      asked.filter((path) => path.startsWith("/api") || /\.pmtiles$/.test(path))
    ).toEqual([])
  })

  test("opens a site from a link to the root", async ({ page }) => {
    await page.goto(`/?site=${aFrame.id}`)
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: aFrame.name })
    ).toBeVisible()
    await expect(page).toHaveURL(`/?site=${aFrame.id}`)
  })

  test("keeps the filters at the root as the list opens and closes", async ({
    page,
  }) => {
    await page.goto("/?access=boat")
    await drawn(page)
    const boat = sites.filter(byBoat).length
    await page.getByRole("button", { name: `List of ${boat} sites` }).click()
    await expect(
      page.getByRole("region", { name: "Cape Town dive sites" })
    ).toBeVisible()
    await expect(page).toHaveURL("/?access=boat&view=list")
    // The list is a screen a level deeper, which Back closes.
    await page.goBack()
    await expect(page).toHaveURL("/?access=boat")
  })

  test.describe("at desktop width", () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test("opens a site's card, its crumb back to the list at the root", async ({
      page,
    }) => {
      await page.goto(`/?site=${aFrame.id}`)
      const map = await drawn(page)
      // Over the map's left side, with no sidebar beside it.
      const card = page.getByRole("region", { name: aFrame.name })
      expect((await card.boundingBox())!.x).toBeCloseTo(map.x + 12, 0)
      expect(map.x).toBe(0)
      await card.getByRole("link", { name: "Dive sites" }).click()
      await expect(page).toHaveURL("/")
      await expect(card).toHaveCount(0)
      // The list's card, folded until opened, says where the sites are.
      const list = page.getByRole("region", { name: "Cape Town dive sites" })
      await expect(
        list.getByRole("heading", { name: "Cape Town dive sites" })
      ).toBeVisible()
      await expect(
        list.getByRole("button", { name: "Show the list" })
      ).toHaveAttribute("aria-expanded", "false")
      // Its maker under the heading.
      await expect(
        list.getByRole("link", { name: "Thomas Kabalin" })
      ).toHaveAttribute("href", "https://thomaskabalin.com")
    })
  })

  test("names its maker in the credit and Sources", async ({ page }) => {
    await page.goto("/")
    await drawn(page)
    // The credit is open until the map is first dragged.
    await expect(
      page
        .locator(".maplibregl-ctrl-attrib")
        .getByRole("link", { name: "Thomas Kabalin" })
    ).toBeVisible()
    await page.getByRole("button", { name: "Map options" }).click()
    const options = page.getByRole("dialog")
    await expect(
      options.getByRole("link", { name: "Thomas Kabalin" })
    ).toHaveAttribute("href", "https://thomaskabalin.com")
    await expect(options.getByRole("link", { name: "Shylog" })).toHaveAttribute(
      "href",
      "https://github.com/tkabalin/shylog"
    )
  })
})
