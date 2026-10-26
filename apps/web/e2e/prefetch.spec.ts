import { expect, type Page } from "@playwright/test"

import { diveId, test } from "./api"

const profile = (page: Page) =>
  page.locator("section[aria-labelledby=profile-h]")
// The fade on the chart's body, which wraps the readout and charts.
const fadeOf = (card: ReturnType<typeof profile>) =>
  card.locator("[data-slot=profile]").evaluate((element) => {
    const style = getComputedStyle(element)
    return `${style.transitionProperty} ${style.transitionDuration}`
  })
const samplesOf = (id: string) => (url: URL) =>
  url.pathname === `/api/dives/${id}/samples`

test("starts the samples and the chart's code while a card is held", async ({
  page,
  request,
}) => {
  const id = await diveId(request, 54)
  await page.goto("/")
  const card = page.locator(`main a[href='/dive/${id}']`)

  const samples = page.waitForRequest((req) =>
    samplesOf(id)(new URL(req.url()))
  )
  const chunk = page.waitForRequest((req) =>
    req.url().includes("/src/chart/profile")
  )
  // hover() scrolls #main on WebKit too, where scrollIntoViewIfNeeded
  // leaves the card off screen. The press follows on the card.
  await card.hover()
  await page.mouse.down()
  await Promise.all([samples, chunk])
  expect(page.url()).not.toContain("/dive/")
  await page.mouse.up()
  await expect(page).toHaveURL(`/dive/${id}`)
})

test("makes no request for samples already on the phone", async ({
  page,
  request,
}) => {
  const id = await diveId(request, 63)
  await page.goto(`/dive/${id}`)
  await expect(profile(page).locator(".recharts-wrapper").first()).toBeVisible()

  const asked: string[] = []
  page.on("request", (req) => {
    if (samplesOf(id)(new URL(req.url()))) asked.push(req.url())
  })
  // A reload starts from the Dexie copy alone.
  await page.reload()
  await expect(profile(page).locator(".recharts-wrapper").first()).toBeVisible()
  expect(asked).toEqual([])
})

test("holds the Profile card's height while loading, then fades the chart in", async ({
  page,
  request,
}) => {
  const id = await diveId(request, 54)
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route(samplesOf(id), async (route) => {
    await held
    await route.continue()
  })
  await page.goto(`/dive/${id}`)
  const card = profile(page)
  await expect(card).toBeVisible()
  const next = page.getByRole("heading", { name: "Figures" })
  const loading = {
    card: await card.boundingBox(),
    next: await next.boundingBox(),
  }

  release()
  const body = card.locator(".recharts-wrapper").first()
  await expect(body).toBeVisible()
  // Read from the style, as a 150 ms fade may be over before a check.
  expect(await fadeOf(card)).toBe("opacity 0.15s")
  expect(await card.boundingBox()).toEqual(loading.card)
  expect(await next.boundingBox()).toEqual(loading.next)
})

test("shows the chart without the fade when motion is reduced", async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(`/dive/${await diveId(request, 63)}`)
  const card = profile(page)
  await expect(card.locator(".recharts-wrapper").first()).toBeVisible()
  expect(await fadeOf(card)).toMatch(/ 0s$/)
})
