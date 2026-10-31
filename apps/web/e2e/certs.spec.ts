import { expect, type APIRequestContext, type Page } from "@playwright/test"

import { deleteCard, getLog, putCard, test } from "./api"
import { png } from "./png"
import { still } from "./ui"

const unique = () => Date.now().toString(36)

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

// A finger's drag across the page, from one point to another, a frame a
// step, as a finger moves: all at once, a drag can end before Motion has
// seen it move.
async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...from)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(
      from[0] + ((to[0] - from[0]) * i) / 8,
      from[1] + ((to[1] - from[1]) * i) / 8
    )
    await page.waitForTimeout(16)
  }
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
  const first = await edit.locator("img").first().boundingBox()
  const at: [number, number] = [
    first!.x + first!.width / 2,
    first!.y + first!.height / 2,
  ]
  await page.mouse.move(...at)
  await page.mouse.down()
  await page.waitForTimeout(500)
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(at[0] + i * 14, at[1])
    await page.waitForTimeout(30)
  }
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
  await expect(sheet.locator("img")).toHaveCount(1)
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
  const from = (await row(second).boundingBox())!
  const to = (await row(first).boundingBox())!
  await drag(
    page,
    [from.x + from.width / 2, from.y + from.height / 2],
    [from.x + from.width / 2, to.y + to.height * 0.9]
  )
  await expect.poll(ours).toEqual([first, second, third])
  // The drag didn't open the card, and a plain click still does.
  await expect(page).toHaveURL(/\/you\/certifications$/)
  await row(first).click()
  await expect(page.getByRole("dialog", { name: first })).toBeVisible()

  // You shows the first three as tiles, in this order, each opening its
  // viewer, which closes back to You.
  await page.goto("/you")
  const tiles = page.locator("main a[href^='/you/certifications/card-']")
  await expect(tiles).toHaveCount(3)
  await expect(tiles.nth(0)).toHaveAccessibleName(first)
  await expect(tiles.nth(1)).toHaveAccessibleName(second)
  await tiles.nth(1).click()
  const viewer = page.getByRole("dialog", { name: second })
  await expect(viewer).toBeVisible()
  await viewer.getByRole("link", { name: "Close" }).click()
  await expect(page).toHaveURL(/\/you$/)
  await page.getByRole("link", { name: /^All certifications/ }).click()
  await expect(page).toHaveURL(/\/you\/certifications$/)
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
