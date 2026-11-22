import { expect, type Page } from "@playwright/test"

import { test } from "./api"

const row = (page: Page, name: RegExp | string) =>
  page.getByRole("row", { name })

test("Best mix finds the exact mix for a depth, and Back returns to You", async ({
  page,
}) => {
  await page.goto("/you")
  await page.getByRole("link", { name: /Best mix/ }).click()
  await expect(page).toHaveURL("/you/best-mix")
  await expect(
    page.getByText("Enter a target depth to see each mix’s NDL")
  ).toBeVisible()

  const depth = page.getByRole("textbox", { name: "Target depth in metres" })
  await depth.fill("35")
  // 1.4 bar over 4,550 mbar, rounded down to the tenth: 30.7 %, whose MOD
  // is the depth itself.
  const exact = row(page, /Exact for 35 m/)
  await expect(exact).toContainText("30.7%")
  await expect(exact).toContainText("35.1 m")
  await expect(exact).toContainText("16 min")
  await expect(row(page, /^31%/)).toContainText("34.6 m")

  await page.getByRole("button", { name: "1 m deeper" }).click()
  await expect(depth).toHaveValue("36")
  await expect(row(page, /Exact for 36 m/)).toContainText("30.1%")

  // The model is shared with the NDL table, and kept on the phone.
  // 36 m is 118.1 fsw, and 30.1 % reads at 100.7 fsw, so the 110 row.
  await page.getByRole("button", { name: "US Navy" }).click()
  await expect(row(page, /Exact for 36 m/)).toContainText("20 min")

  // Pushed from You, so Back returns there.
  await page.goBack()
  await expect(page).toHaveURL("/you")
  await page.getByRole("link", { name: /NDL table/ }).click()
  await expect(page.getByRole("button", { name: "US Navy" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
})

test("NDL table moves the MOD line with the mix, and Back returns to You", async ({
  page,
}) => {
  await page.goto("/you")
  await page.getByRole("link", { name: /NDL table/ }).click()
  await expect(page).toHaveURL("/you/ndl")
  await expect(page.getByText("MOD 1.4 · 33.2 m")).toBeVisible()
  // Subsurface's planner in Recreational mode, GF 30/85: 23 min 40 s.
  await expect(row(page, /^30 m/)).toContainText("23 min")
  await expect(row(page, /^30 m/)).toContainText("1.29")

  await page.getByRole("button", { name: "EAN36" }).click()
  await expect(page.getByText("MOD 1.4 · 28.4 m")).toBeVisible()
  await expect(page.getByText("Mix · EAN36")).toBeVisible()

  await page.getByRole("textbox", { name: "Oxygen percentage" }).fill("40")
  await expect(page.getByText("MOD 1.4 · 24.6 m")).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL("/you")
})
