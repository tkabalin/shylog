import { expect, type Page } from "@playwright/test"

import { test } from "./api"

const item = (page: Page, name: string) =>
  page.getByRole("checkbox", { name, exact: true })

test("ticks items that stay ticked over a reload, and Reset clears them with Undo", async ({
  page,
}) => {
  await page.goto("/you")
  await page.getByRole("link", { name: /Packing list/ }).click()
  await expect(page).toHaveURL("/you/packing")
  await item(page, "BCD").click()
  await item(page, "Mask").click()
  await expect(item(page, "BCD")).toBeChecked()
  await expect(page.getByText("2 of 25 packed")).toBeVisible()

  await page.reload()
  await expect(item(page, "BCD")).toBeChecked()
  await expect(item(page, "Snorkel")).not.toBeChecked()

  await page.getByRole("button", { name: "Reset" }).click()
  await expect(item(page, "BCD")).not.toBeChecked()
  await expect(page.getByText("0 of 25 packed")).toBeVisible()
  await expect(page.getByRole("button", { name: "Reset" })).toBeDisabled()
  await page.getByRole("button", { name: "Undo" }).click()
  await expect(item(page, "BCD")).toBeChecked()
  await expect(item(page, "Mask")).toBeChecked()

  // Pushed from You, so Back returns there.
  await page.goBack()
  await expect(page).toHaveURL("/you")
  await expect(page.getByRole("link", { name: /Packing list/ })).toBeVisible()
})

test("shows and ticks the list offline", async ({ page, context }) => {
  await page.goto("/you/packing")
  await expect(item(page, "BCD")).toBeVisible()
  await context.setOffline(true)
  await item(page, "BCD").click()
  await expect(item(page, "BCD")).toBeChecked()
})
