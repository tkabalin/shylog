import { expect, type APIRequestContext, type Page } from "@playwright/test"

import { deleteCard, getLog, putCard, test } from "./api"
import { png } from "./png"
import { still } from "./ui"

// Digits only: a base-36 tag can spell a word ("mwnamebc"), and a loose
// locator such as getByLabel("Name") then matches a row holding it.
const unique = () => String(Date.now())

// Two screenshots of different shapes and colours, as the picker gives them.
const shots = [
  {
    name: "front.png",
    mimeType: "image/png",
    buffer: png(300, 400, [30, 60, 120]),
  },
  {
    name: "back.png",
    mimeType: "image/png",
    buffer: png(400, 300, [240, 240, 245]),
  },
]

// Every card a test made, by the name it starts with, deleted when it ends.
const cleanUp = (prefix: string) => async (request: APIRequestContext) => {
  const log = await getLog(request)
  for (const card of log.cards)
    if (card.name.startsWith(prefix)) await deleteCard(request, card.id)
}

// The list's add button, or the empty screen's when there are no cards.
async function pick(page: Page, files: typeof shots) {
  const chooser = page.waitForEvent("filechooser")
  await page
    .getByRole("button", { name: /^(Add a card|Choose screenshots)$/ })
    .click()
  await (await chooser).setFiles(files)
  const sheet = page.getByRole("dialog", { name: "New card" })
  await expect(sheet).toBeVisible()
  await still(sheet)
  return sheet
}

// A finger's drag across the page, a real frame a step, as WebKit's frames
// on a busy runner outlast a timeout. `held` keeps the finger down until it
// passes, so the release can't land before the list has taken the last move.
async function drag(
  page: Page,
  from: [number, number],
  to: [number, number],
  held?: () => Promise<void>
) {
  await page.mouse.move(...from)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(
      from[0] + ((to[0] - from[0]) * i) / 8,
      from[1] + ((to[1] - from[1]) * i) / 8
    )
    await page.evaluate(() => new Promise(requestAnimationFrame))
  }
  await held?.()
  await page.mouse.up()
}

test("adds two screenshots as one card, swipes, reorders, renames and deletes it @writes", async ({
  page,
  restore,
}) => {
  const name = `E2E Card ${unique()}`
  restore(cleanUp(name))
  await page.goto("/you")
  await page.getByRole("link", { name: /^Certifications/ }).click()
  await expect(page).toHaveURL(/\/you\/certifications$/)

  const sheet = await pick(page, shots)
  await expect(
    sheet.getByRole("button", { name: "One card, 2 pages" })
  ).toHaveAttribute("aria-pressed", "true")
  const save = sheet.getByRole("button", { name: "Save" })
  // A card needs its name.
  await expect(save).toBeDisabled()
  await sheet.getByPlaceholder("e.g. Rescue Diver").fill(name)
  await save.click()
  await expect(sheet).toBeHidden()

  const row = page.getByRole("link", { name: new RegExp(`^${name}`) })
  await expect(row).toContainText("2 screenshots")
  const [card] = (await getLog(page.request)).cards.filter(
    (one) => one.name === name
  )
  expect(card!.images).toHaveLength(2)

  // The viewer opens on the first page; a swipe turns to the second.
  await row.click()
  const viewer = page.getByRole("dialog", { name })
  await expect(viewer).toBeVisible()
  await expect(
    viewer.getByRole("tab", { name: "Screenshot 1" })
  ).toHaveAttribute("aria-selected", "true")
  await expect(
    viewer.getByRole("img", { name: `${name}, screenshot 1 of 2` })
  ).toBeVisible()
  await drag(page, [300, 420], [80, 420])
  await expect(
    viewer.getByRole("tab", { name: "Screenshot 2" })
  ).toHaveAttribute("aria-selected", "true")

  // The dots' whole strip is a page control: a tap well left of the shown
  // dot turns back a page, and one well right turns on.
  const strip = (await viewer.getByRole("tablist").boundingBox())!
  await page.mouse.click(strip.x + 40, strip.y + strip.height / 2)
  await expect(
    viewer.getByRole("tab", { name: "Screenshot 1" })
  ).toHaveAttribute("aria-selected", "true")
  await page.mouse.click(strip.x + strip.width - 40, strip.y + strip.height / 2)
  await expect(
    viewer.getByRole("tab", { name: "Screenshot 2" })
  ).toHaveAttribute("aria-selected", "true")

  // A long press lifts the first page, and a drag puts it after the second.
  await viewer.getByRole("button", { name: "Edit card" }).click()
  const edit = page.getByRole("dialog", { name: "Edit card" })
  await still(edit)
  // Both pages loaded first: one still loading widens mid-drag and moves
  // the point where they swap. Their object URLs give the strip's order.
  const pages = edit.getByRole("region", { name: "Screenshots" }).locator("img")
  await expect
    .poll(() =>
      pages.evaluateAll(
        (all) =>
          all.filter((one) => (one as HTMLImageElement).naturalWidth > 0).length
      )
    )
    .toBe(2)
  const order = () =>
    pages.evaluateAll((all) => all.map((one) => (one as HTMLImageElement).src))
  const before = await order()
  const first = await pages.first().boundingBox()
  const at: [number, number] = [
    first!.x + first!.width / 2,
    first!.y + first!.height / 2,
  ]
  await page.mouse.move(...at)
  await page.mouse.down()
  await page.waitForTimeout(500)
  // A frame a step, as WebKit's frames on a busy runner outlast a timeout.
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(at[0] + i * 14, at[1])
    await page.evaluate(() => new Promise(requestAnimationFrame))
  }
  // Held until the strip has swapped, so a release can't land before it
  // has taken the last move.
  await expect.poll(order).toEqual([...before].reverse())
  await page.mouse.up()

  await edit.getByRole("textbox").fill(`${name} Plus`)
  await edit.getByRole("button", { name: "Save" }).click()
  await expect(edit).toBeHidden()
  await expect(viewer.getByRole("heading")).toHaveText(`${name} Plus`)
  const saved = (await getLog(page.request)).cards.find(
    (one) => one.id === card!.id
  )
  expect(saved).toEqual({
    id: card!.id,
    name: `${name} Plus`,
    images: [...card!.images].reverse(),
    thumb: null,
  })

  // Delete asks first, then the list takes the viewer's place.
  await viewer.getByRole("button", { name: "Edit card" }).click()
  await page.getByRole("button", { name: "Delete card" }).click()
  const confirm = page.getByRole("alertdialog", { name: "Delete this card?" })
  await confirm.getByRole("button", { name: "Delete card" }).click()
  await expect(viewer).toBeHidden()
  await expect(page).toHaveURL(/\/you\/certifications$/)
  await expect(
    page.getByRole("link", { name: new RegExp(`^${name}`) })
  ).toHaveCount(0)
  expect(
    (await getLog(page.request)).cards.find((one) => one.id === card!.id)
  ).toBeUndefined()
  // The viewer was a step deeper, so Back goes on to You.
  await page.goBack()
  await expect(page).toHaveURL(/\/you$/)
})

test("crops a card's thumbnail from Edit card, and You's tile follows @writes", async ({
  page,
  restore,
}) => {
  const name = `E2E Crop ${unique()}`
  restore(cleanUp(name))
  const id = `card-e2e-${unique()}`
  // A screenshot's shape, so the frame can pan down it.
  await putCard(page.request, id, name, [png(300, 600, [30, 60, 120])])
  await page.goto(`/you/certifications/${id}`)
  await page.getByRole("button", { name: "Edit card" }).click()
  const edit = page.getByRole("dialog", { name: "Edit card" })
  await still(edit)
  await edit.getByRole("button", { name: "Thumbnail" }).click()
  const crop = page.getByRole("dialog", { name: "Thumbnail" })
  await still(crop)
  // Up the screen, so the frame shows further down the page.
  await drag(page, [195, 500], [195, 380])
  await crop.getByRole("button", { name: "Done" }).click()
  await expect(crop).toBeHidden()
  // Only a change to save: the crop counts as one.
  await edit.getByRole("button", { name: "Save" }).click()
  await expect(edit).toBeHidden()

  const saved = (await getLog(page.request)).cards.find((one) => one.id === id)
  expect(saved!.thumb).toMatchObject({ hash: saved!.images[0], scale: 1 })
  expect(saved!.thumb!.x).toBeCloseTo(0.5)
  expect(saved!.thumb!.y).toBeGreaterThan(0.55)

  // Reset puts it back to the page's centre, which is no crop at all.
  await page.getByRole("button", { name: "Edit card" }).click()
  await still(edit)
  await edit.getByRole("button", { name: "Thumbnail" }).click()
  await still(crop)
  await crop.getByRole("button", { name: "Reset" }).click()
  await crop.getByRole("button", { name: "Done" }).click()
  await edit.getByRole("button", { name: "Save" }).click()
  await expect(edit).toBeHidden()
  await expect
    .poll(
      async () =>
        (await getLog(page.request)).cards.find((one) => one.id === id)!.thumb
    )
    .toBeNull()
})

test("adds two screenshots as separate cards @writes", async ({
  page,
  restore,
}) => {
  const name = `E2E Cards ${unique()}`
  restore(cleanUp(name))
  await page.goto("/you/certifications")
  const sheet = await pick(page, shots)
  await sheet.getByRole("button", { name: "2 separate cards" }).click()
  await sheet.getByLabel("Name for screenshot 1").fill(`${name} Front`)
  const save = sheet.getByRole("button", { name: "Save" })
  // Each card needs its own name.
  await expect(save).toBeDisabled()
  await sheet.getByLabel("Name for screenshot 2").fill(`${name} Back`)
  await save.click()
  await expect(sheet).toBeHidden()

  for (const part of ["Front", "Back"])
    await expect(
      page.getByRole("link", { name: new RegExp(`^${name} ${part}`) })
    ).toContainText("1 screenshot")
  const cards = (await getLog(page.request)).cards.filter((one) =>
    one.name.startsWith(name)
  )
  expect(cards.map((one) => one.images.length)).toEqual([1, 1])
})

test("asks before discarding a new card's screenshots", async ({ page }) => {
  await page.goto("/you/certifications")
  const sheet = await pick(page, shots.slice(0, 1))
  await sheet.getByRole("button", { name: "Cancel" }).click()
  await page.getByRole("button", { name: "Keep editing" }).click()
  await expect(sheet).toBeVisible()
  await sheet.getByRole("button", { name: "Cancel" }).click()
  await page.getByRole("button", { name: "Discard card" }).click()
  await expect(sheet).toBeHidden()
})

test("leaves out a HEIC the browser can't open, and says why", async ({
  page,
}) => {
  await page.goto("/you/certifications")
  // A HEIC's header over bytes no decoder can read, so every browser
  // refuses it; turning a real one into JPEG is checked on the phone.
  const heic = Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from("ftypheic"),
    Buffer.alloc(64),
  ])
  const sheet = await pick(page, [
    shots[0]!,
    { name: "card.heic", mimeType: "image/heic", buffer: heic },
  ])
  await expect(
    sheet.getByText("This browser can’t open HEIC. Save it as a JPEG first.")
  ).toBeVisible()
  await expect(
    sheet.getByRole("region", { name: "Screenshots" }).locator("img")
  ).toHaveCount(1)
  await sheet.getByRole("button", { name: "Cancel" }).click()
  await page.getByRole("button", { name: "Discard card" }).click()
})

test("puts a new card first and moves one by dragging it @writes", async ({
  page,
  restore,
}) => {
  const prefix = `Order ${unique()}`
  restore(cleanUp(prefix))
  const [first, second, third] = [`${prefix} A`, `${prefix} B`, `${prefix} C`]
  await putCard(page.request, `card-${unique()}c`, third, [shots[0]!.buffer])
  await putCard(page.request, `card-${unique()}a`, first, [shots[0]!.buffer])
  await putCard(page.request, `card-${unique()}b`, second, [shots[1]!.buffer])
  const ours = async () =>
    (await getLog(page.request)).cards
      .map((card) => card.name)
      .filter((name) => name.startsWith(prefix))
  expect(await ours()).toEqual([second, first, third])

  await page.goto("/you/certifications")
  const row = (name: string) =>
    page.getByRole("link", { name: new RegExp(`^${name}`) })
  // The rows as drawn, which the drag reorders as it goes.
  const shown = () =>
    expect.poll(async () =>
      (await row(prefix).allTextContents()).map((text) =>
        [first, second, third].find((name) => text.startsWith(name))
      )
    )
  const from = (await row(second).boundingBox())!
  const to = (await row(first).boundingBox())!
  await drag(
    page,
    [from.x + from.width / 2, from.y + from.height / 2],
    [from.x + from.width / 2, to.y + to.height * 0.9],
    () => shown().toEqual([first, second, third])
  )
  await expect.poll(ours).toEqual([first, second, third])
  // A row's grip lifts it at once and drags it, here the last to the top,
  // once the first drag's rows have settled.
  await still(row(first))
  await still(row(third))
  const grip = (await row(third).locator("[data-grip]").boundingBox())!
  const top = (await row(first).boundingBox())!
  await drag(
    page,
    [grip.x + grip.width / 2, grip.y + grip.height / 2],
    [grip.x + grip.width / 2, top.y + top.height * 0.1],
    () => shown().toEqual([third, first, second])
  )
  await expect.poll(ours).toEqual([third, first, second])
  // Neither drag opened a card, and a plain click still does.
  await expect(page).toHaveURL(/\/you\/certifications$/)
  await row(first).click()
  await expect(page.getByRole("dialog", { name: first })).toBeVisible()

  // You shows the first three as tiles, in this order, each opening its
  // viewer, which closes back to You.
  await page.goto("/you")
  const tiles = page.locator("main a[href^='/you/certifications/card-']")
  await expect(tiles).toHaveCount(3)
  await expect(tiles.nth(0)).toHaveAccessibleName(third)
  await expect(tiles.nth(1)).toHaveAccessibleName(first)
  await tiles.nth(1).click()
  const viewer = page.getByRole("dialog", { name: first })
  await expect(viewer).toBeVisible()
  await viewer.getByRole("link", { name: "Close" }).click()
  await expect(page).toHaveURL(/\/you$/)
  await page.getByRole("link", { name: /^All certifications/ }).click()
  await expect(page).toHaveURL(/\/you\/certifications$/)
})

// Held still near an edge, a row or page keeps the list scrolling under
// it and finds its place among the rows that came into view.
test("scrolls the list under a card held at its edge @writes", async ({
  page,
  restore,
}) => {
  // Scrolling the whole list at the edge's pace, under parallel stacks.
  test.slow()
  const prefix = `Edge ${unique()}`
  restore(cleanUp(prefix))
  const names = Array.from(
    { length: 12 },
    (_, n) => `${prefix} ${String(n).padStart(2, "0")}`
  )
  // Each goes first, so the list shows them last to first.
  for (const name of names)
    await putCard(page.request, `card-${unique()}${name.slice(-2)}`, name, [
      shots[0]!.buffer,
    ])
  const listed = [...names].reverse()
  const ours = async () =>
    (await getLog(page.request)).cards
      .map((card) => card.name)
      .filter((name) => name.startsWith(prefix))
  // Short, so the twelve rows run well past the screen.
  await page.setViewportSize({ width: 390, height: 600 })
  await page.goto("/you/certifications")
  const rows = page.locator("main ul > li")
  const drawn = () =>
    rows.evaluateAll(
      (all, prefix) =>
        all
          .map((row) => row.querySelector(".truncate")!.textContent!)
          .filter((name) => name.startsWith(prefix)),
      prefix
    )
  await expect.poll(drawn).toEqual(listed)
  const main = page.locator("#main")
  const scrolled = () => main.evaluate((node) => node.scrollTop)
  const edges = await main.evaluate((node) => ({
    top: node.querySelector("header")!.getBoundingClientRect().bottom,
    bottom:
      node.getBoundingClientRect().bottom -
      parseFloat(getComputedStyle(node).paddingBottom),
  }))

  // The last row, by its grip, to just under the bar, held still there
  // until the list has scrolled to its top and the row has gone first.
  await main.evaluate((node) => (node.scrollTop = node.scrollHeight))
  await expect.poll(scrolled).toBeGreaterThan(0)
  const last = page
    .getByRole("link", { name: new RegExp(`^${names[0]}`) })
    .locator("[data-grip]")
  const grip = (await last.boundingBox())!
  const x = grip.x + grip.width / 2
  await drag(
    page,
    [x, grip.y + grip.height / 2],
    [x, edges.top + 12],
    async () => {
      // Scrolling the whole list at the edge's pace takes a few seconds.
      await expect.poll(scrolled, { timeout: 10_000 }).toBe(0)
      await expect.poll(drawn).toEqual([names[0], ...listed.slice(0, -1)])
    }
  )
  await expect.poll(ours).toEqual([names[0], ...listed.slice(0, -1)])

  // And back down to just above the tabs, until it is last again.
  await expect(rows.first()).not.toHaveAttribute("style", /translate/)
  const first = (await rows.first().locator("[data-grip]").boundingBox())!
  await drag(
    page,
    [x, first.y + first.height / 2],
    [x, edges.bottom - 12],
    async () => {
      await expect
        .poll(
          () =>
            main.evaluate(
              (node) => node.scrollHeight - node.clientHeight - node.scrollTop
            ),
          { timeout: 10_000 }
        )
        .toBeLessThan(1)
      await expect.poll(drawn).toEqual(listed)
    }
  )
  await expect.poll(ours).toEqual(listed)
})

test("scrolls the screenshot strip under a page held at its edge @writes", async ({
  page,
  restore,
}) => {
  // Scrolling the whole strip at the edge's pace, under parallel stacks.
  test.slow()
  const name = `E2E Strip ${unique()}`
  restore(cleanUp(name))
  const id = `card-e2e-${unique()}`
  // Eight pages of different colours, more than the strip shows.
  await putCard(
    page.request,
    id,
    name,
    Array.from({ length: 8 }, (_, n) => png(300, 600, [n * 30, 90, 160]))
  )
  const [card] = (await getLog(page.request)).cards.filter(
    (one) => one.id === id
  )
  await page.goto(`/you/certifications/${id}`)
  await page.getByRole("button", { name: "Edit card" }).click()
  const edit = page.getByRole("dialog", { name: "Edit card" })
  await still(edit)
  const region = edit.getByRole("region", { name: "Screenshots" })
  const pages = region.locator("img")
  await expect
    .poll(() =>
      pages.evaluateAll(
        (all) =>
          all.filter((one) => (one as HTMLImageElement).naturalWidth > 0).length
      )
    )
    .toBe(8)
  const strip = region.locator(":scope > div")
  const room = () =>
    strip.evaluate(
      (node) => node.scrollWidth - node.clientWidth - node.scrollLeft
    )
  expect(await room()).toBeGreaterThan(0)
  const order = () =>
    pages.evaluateAll((all) => all.map((one) => (one as HTMLImageElement).src))
  const before = await order()
  const edge = (await strip.boundingBox())!
  // Each page shows a grip, as each Certifications row does.
  const grips = region.locator("[data-grip]")
  await expect(grips).toHaveCount(8)
  const grip = (await grips.first().boundingBox())!
  const x = grip.x + grip.width / 2
  const y = grip.y + grip.height / 2

  // The first page by its grip, to the strip's right edge, held there until
  // the strip has scrolled to its end and the page has gone last.
  await drag(page, [x, y], [edge.x + edge.width - 12, y], async () => {
    await expect.poll(room, { timeout: 10_000 }).toBeLessThan(1)
    await expect.poll(order).toEqual([...before.slice(1), before[0]])
  })
  await edit.getByRole("button", { name: "Save" }).click()
  await expect(edit).toBeHidden()
  const saved = (await getLog(page.request)).cards.find((one) => one.id === id)
  expect(saved!.images).toEqual([...card!.images.slice(1), card!.images[0]])
})

test("keeps the screen on where the browser can @writes", async ({
  page,
  restore,
}) => {
  const id = `card-${crypto.randomUUID()}`
  const name = `E2E Lock ${unique()}`
  await putCard(page.request, id, name, [shots[0]!.buffer])
  restore((request) => deleteCard(request, id))
  // A stand-in for the Wake Lock API, which records what it's asked.
  await page.addInitScript(() => {
    const held: string[] = []
    Object.defineProperty(window, "held", { value: held })
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async (type: string) => {
          held.push(type)
          return {
            release: async () => void held.pop(),
            addEventListener: () => {},
          }
        },
      },
    })
  })
  await page.goto(`/you/certifications/${id}`)
  await expect(page.getByRole("heading", { name })).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { held: string[] }).held)
    )
    .toEqual(["screen"])
  // Closing lets the screen sleep again.
  await page.getByRole("link", { name: "Close" }).click()
  await expect(page).toHaveURL(/\/you\/certifications$/)
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { held: string[] }).held)
    )
    .toEqual([])

  // Refused, as a phone saving power may, the card still opens.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request: () => Promise.reject(new Error("Not allowed")) },
    })
  })
  await page.goto(`/you/certifications/${id}`)
  await expect(page.getByRole("heading", { name })).toBeVisible()

  // Nor without the API at all.
  await page.addInitScript(() => {
    delete (navigator as { wakeLock?: unknown }).wakeLock
    delete (Navigator.prototype as { wakeLock?: unknown }).wakeLock
  })
  await page.goto(`/you/certifications/${id}`)
  await expect(page.getByRole("heading", { name })).toBeVisible()
})
