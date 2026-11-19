import { readFileSync } from "node:fs"
import { expect, type Locator, type Page } from "@playwright/test"

import type { Part } from "../src/map/page-text"

// What the Explore specs share: the map's data as the refresh script wrote
// it, and the waits for the map and its sheet.

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
export const read = (file: string) =>
  JSON.parse(readFileSync(`${import.meta.dirname}/../src/map/${file}`, "utf8"))
export const sites = (
  read("sites.geojson") as { features: { properties: Site }[] }
).features.map((feature) => feature.properties)
export const pages = read("pages.json") as Record<string, Part[]>
export const site = (id: string) => sites.find((each) => each.id === id)!
// A boat dive, a site dived both ways included, as the Access filter has it.
export const byBoat = ({ access }: Site) =>
  access === "boat" || access === "both"
// Each site's maps and images, and the caption each was shown with.
export const images = read("images.json") as {
  sites: Record<string, string[]>
  files: Record<string, { caption: string }>
}
export const captions = (id: string) =>
  images.sites[id].map((file) => images.files[file].caption)
export const text = (part: Part) =>
  typeof part === "string" ? part : part.text
// Markdown as the sheet shows it, without its marks.
export const plain = (markdown: string) =>
  markdown.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_]/g, "")
export const firstHeading = (page: string) =>
  pages[page]
    .map(text)
    .join("\n")
    .match(/^#+ (.+)$/m)![1]
export const aFrame = site("a-frame")
// The first other site A-Frame's page links to, and the words of its link.
export const [, linkText, linked] = pages[aFrame.page!]
  .map(text)
  .join("\n")
  .match(/\[([^\]]+)\]\(site:((?!a-frame\))[^)]+)\)/)!
export const bySite = (id: string) => (url: URL) =>
  url.searchParams.get("site") === id
export const english = new Intl.Collator("en")
export const escape = (words: string) =>
  words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
// The pages several sites share, as the map groups them: by the slug their
// ids start with.
const bySlug = new Map<string, Site[]>()
for (const each of sites) {
  if (!each.page) continue
  const slug = each.id.split("/")[0]!
  bySlug.set(slug, [...(bySlug.get(slug) ?? []), each])
}
export const pagesByShared = [...bySlug]
  .filter(([, on]) => on.length > 1)
  .map(([slug, on]) => ({ id: `page:${slug}`, name: on[0]!.page!, sites: on }))
const sharedPage = (id: string) => pagesByShared.find((each) => each.id === id)!
export const castle = sharedPage("page:castle-rocks")
export const castor = sharedPage("page:castor-rock")
// Text that is all of an element's own.
export const whole = (words: string) =>
  new RegExp(`^${words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
// The first heading inside a page's first section, shown once it opens.
export const firstSubheading = (page: string) =>
  pages[page]
    .map(text)
    .join("\n")
    .split(/^(?=## )/m)
    .find((section) => section.startsWith("## "))!
    .match(/^### (.+)$/m)![1]
// The page's section a piece of its text is in, which folds.
export const sectionOf = (page: string, words: string) =>
  pages[page]
    .map(text)
    .join("\n")
    .split(/^(?=## )/m)
    .find((section) => section.includes(words))!
    .match(/^## (.+)$/m)![1]

// The map is a canvas, so a pin is found from where the camera puts it.
export async function drawn(page: Page) {
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
export async function withSatellite(
  page: Page,
  { refused = false, unanswered = false } = {}
) {
  const pages = ["/", "/explore"]
  await page.route(
    (url) => pages.includes(url.pathname),
    async (route) => {
      // Once more where the server closed the kept-alive socket as it was reused.
      const response = await route.fetch({ maxRetries: 1 })
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
export async function resting(sheet: Locator) {
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
export async function drag(page: Page, sheet: Locator, by: number) {
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
