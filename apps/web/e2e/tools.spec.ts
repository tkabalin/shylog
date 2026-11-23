import { expect, type Page } from "@playwright/test"

import { test } from "./api"

const row = (page: Page, name: RegExp | string) =>
  page.getByRole("row", { name })

test("Best nitrox mix finds the exact mix for a depth, and Back returns to You", async ({
  page,
}) => {
  await page.goto("/you")
  await page.getByRole("link", { name: /Best nitrox mix/ }).click()
  await expect(page).toHaveURL("/you/best-mix")
  const depth = page.getByRole("textbox", { name: "Target depth in metres" })
  await depth.fill("35")
  // 1.4 bar over 4,550 mbar, rounded down to the tenth: 30.7 %, whose MOD
  // is the depth itself.
  const exact = row(page, /^30\.7%/)
  await expect(exact).toContainText("35.1 m")
  await expect(exact).toContainText("16 min")
  await expect(row(page, /^31%/)).toContainText("34.6 m")

  await page.getByRole("button", { name: "1 m deeper" }).click()
  await expect(depth).toHaveValue("36")
  await expect(row(page, /^30\.1%/)).toBeVisible()

  // The model is shared with the NDL table, and kept on the phone.
  // 36 m is 118.1 fsw, and 30.1 % reads at 100.7 fsw, so the 110 row.
  // Picked from the NDL heading's sheet, which says what each model is.
  await page.getByRole("button", { name: "NDL model, GF 85" }).click()
  await expect(
    page.getByText("Bühlmann ZHL-16C, gradient factors 30/85")
  ).toBeVisible()
  await page.getByRole("option", { name: /^US Navy/ }).click()
  await expect(row(page, /^30\.1%/)).toContainText("20 min")

  // Pushed from You, so Back returns there.
  await page.goBack()
  await expect(page).toHaveURL("/you")
  await page.getByRole("link", { name: /NDL table/ }).click()
  await expect(
    page.getByRole("button", { name: "NDL model, US Navy" })
  ).toBeVisible()
})

test("NDL table leaves the rows still as the mix changes, and trims its foot only out of view", async ({
  page,
}) => {
  await page.goto("/you/ndl")
  await expect(page.getByText("33.2 m", { exact: true })).toBeVisible()
  const top = async (name: RegExp) => (await row(page, name).boundingBox())!.y
  // A depth being watched stays where it is while the line moves past it.
  const watched = await top(/^30 m/)
  await page.getByRole("button", { name: "EAN36" }).click()
  await expect(page.getByText("28.4 m", { exact: true })).toBeVisible()
  expect(await top(/^30 m/)).toBe(watched)

  // At Air's foot, a richer mix keeps the rows on screen.
  await page.getByRole("button", { name: "Air", exact: true }).click()
  const main = page.locator("#main")
  await main.evaluate((m) => m.scrollTo(0, m.scrollHeight))
  await expect(row(page, /^60 m/)).toBeInViewport()
  const foot = await top(/^55 m/)
  await page.getByRole("button", { name: "EAN40" }).click()
  await expect(page.getByText("Mix · EAN40")).toBeVisible()
  expect(await top(/^55 m/)).toBe(foot)
  await expect(row(page, /^60 m/)).toContainText("—")

  // Once they've left the screen they go, and the table ends at EAN40's own
  // foot, 3 m past its 1.6 bar MOD.
  await main.evaluate((m) => m.scrollTo(0, 0))
  await expect(row(page, /^60 m/)).toHaveCount(0)
  await expect(page.getByRole("row").last()).toHaveAccessibleName(/^32 m/)
})

test("NDL table moves the MOD line with the mix, and Back returns to You", async ({
  page,
}) => {
  await page.goto("/you")
  await page.getByRole("link", { name: /NDL table/ }).click()
  await expect(page).toHaveURL("/you/ndl")
  await expect(page.getByText("33.2 m", { exact: true })).toBeVisible()
  // Subsurface's planner in Recreational mode, GF 30/85: 23 min 40 s.
  await expect(row(page, /^30 m/)).toContainText("23 min")
  await expect(row(page, /^30 m/)).toContainText("1.29")

  await page.getByRole("button", { name: "EAN36" }).click()
  await expect(page.getByText("28.4 m", { exact: true })).toBeVisible()
  await expect(page.getByText("Mix · EAN36")).toBeVisible()

  await page.getByRole("textbox", { name: "Oxygen percentage" }).fill("40")
  await expect(page.getByText("24.6 m", { exact: true })).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL("/you")
})
