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

test("starts the samples while a card is held", async ({ page, request }) => {
  const id = await diveId(request, 54)
  await page.goto("/")
  const card = page.locator(`main a[href='/dive/${id}']`)
  // The background download would fetch them too; holding it off shows
  // the press alone asks for this dive's.
  await page.route("**/api/samples?*", () => {})

  const samples = page.waitForRequest((req) =>
    samplesOf(id)(new URL(req.url()))
  )
  // hover() scrolls #main on WebKit too, where scrollIntoViewIfNeeded
  // leaves the card off screen. The press follows on the card.
  await card.hover()
  await page.mouse.down()
  await samples
  expect(page.url()).not.toContain("/dive/")
  await page.mouse.up()
  await expect(page).toHaveURL(`/dive/${id}`)
})

// The profiles the phone keeps, read from its IndexedDB.
const keptProfiles = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("shylog")
        open.onerror = () => reject(open.error)
        // None yet while the app hasn't made the store, so the poll waits.
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains("profiles")) return resolve(0)
          const count = db
            .transaction("profiles")
            .objectStore("profiles")
            .count()
          count.onerror = () => reject(count.error)
          count.onsuccess = () => resolve(count.result)
        }
      })
  )

test("keeps every dive's profile on the phone after a sync", async ({
  page,
  request,
  context,
}) => {
  await page.goto("/")
  await expect(page.locator("main a[href^='/dive/']").first()).toBeVisible()
  await expect.poll(() => keptProfiles(page)).toBe(46)

  // Open one dive in the app while online, so the detail's code is loaded,
  // then, offline, a dive never opened.
  const [opened, never] = [await diveId(request, 63), await diveId(request, 54)]
  await page.locator(`main a[href='/dive/${opened}']`).click()
  await expect(profile(page).locator(".recharts-wrapper").first()).toBeVisible()
  await page.goBack()
  const card = page.locator(`main a[href='/dive/${never}']`)
  await expect(card).toBeAttached()
  await context.setOffline(true)
  await card.click()
  await expect(profile(page).locator(".recharts-wrapper").first()).toBeVisible()
  await context.setOffline(false)
})

test("draws a kept dive's chart with no skeleton", async ({
  page,
  request,
}) => {
  const id = await diveId(request, 61)
  await page.goto("/")
  await expect.poll(() => keptProfiles(page)).toBe(46)
  // A fresh start: nothing in memory but the log, the chart's code loaded
  // while the Log was idle.
  await page.reload()
  await expect(page.locator("main a[href^='/dive/']").first()).toBeVisible()
  await page.waitForTimeout(1000)
  await page.evaluate(() => {
    const seen = new MutationObserver(() => {
      if (document.querySelector("[data-slot=skeleton]:not(.invisible *)"))
        document.body.dataset.skeleton = "seen"
    })
    seen.observe(document.body, { subtree: true, childList: true })
  })
  await page.locator(`main a[href='/dive/${id}']`).click()
  await expect(profile(page).locator(".recharts-wrapper").first()).toBeVisible()
  expect(await page.evaluate(() => document.body.dataset.skeleton)).toBe(
    undefined
  )
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
  // Held off too, or the background download would bring them first.
  await page.route("**/api/samples?*", () => {})
  await page.goto(`/dive/${id}`)
  const card = profile(page)
  await expect(card).toBeVisible()
  const next = page.getByRole("heading", { name: "Figures" })
  // A font arriving late would move the card between the two reads.
  await page.evaluate(() => document.fonts.ready.then(() => {}))
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
