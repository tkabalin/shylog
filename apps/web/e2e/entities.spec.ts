import { expect, type APIRequestContext, type Page } from "@playwright/test"

import { deleteEntity, diveId, getLog, patchDive, putEntity, test } from "./api"
import { still } from "./ui"

const unique = () => Date.now().toString(36)

// A site nothing uses, removed again when the test ends.
async function newSite(
  page: Page,
  restore: (undo: (request: APIRequestContext) => Promise<void>) => void,
  name: string,
  fields: Record<string, unknown> = {}
) {
  const id = `site-${crypto.randomUUID()}`
  await putEntity(page.request, "site", id, {
    name,
    countryCode: "ZA",
    ...fields,
  })
  restore((request) => deleteEntity(request, "site", id))
  return id
}

test("renames a site with Save @writes", async ({ page, restore }) => {
  const name = `E2E Site ${unique()}`
  const id = await newSite(page, restore, name)
  await page.goto(`/you/entities?kind=site&q=${encodeURIComponent(name)}`)
  await page.getByRole("link", { name: new RegExp(`^${name},`) }).click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name)
  // In the bar from the start, and off until something changes.
  const save = page.getByRole("button", { name: "Save", exact: true })
  await expect(save).toBeDisabled()

  await page.getByLabel("Name").fill(`${name} North`)
  await save.click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `${name} North`
  )
  await expect(save).toBeDisabled()
  const log = await getLog(page.request)
  expect(log.sites.find((site) => site.id === id)?.name).toBe(`${name} North`)
  // Back returns to the list it was opened from.
  await page.getByRole("link", { name: "Sites", exact: true }).click()
  await expect(page).toHaveURL(/\/you\/entities\?/)
})

test("offers Merge instead for a rename that collides @writes", async ({
  page,
  restore,
}) => {
  const tag = unique()
  const keep = await newSite(page, restore, `E2E Keep ${tag}`)
  const other = await newSite(page, restore, `E2E Other ${tag}`)
  await page.goto(`/you/entities/site/${other}`)
  await page.getByLabel("Name").fill(`e2e keep ${tag}`)
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(
    page.getByText(`There is already a site called E2E Keep ${tag}`)
  ).toBeVisible()
  await page.getByRole("button", { name: "Merge instead" }).click()
  // The survivor takes the merged-away site's place.
  await expect(page).toHaveURL(new RegExp(`/you/entities/site/${keep}$`))
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `E2E Keep ${tag}`
  )
  const log = await getLog(page.request)
  expect(log.sites.some((site) => site.id === other)).toBe(false)
})

test("merges a duplicate, moving its dives @writes", async ({
  page,
  restore,
}) => {
  const tag = unique()
  const dive = await diveId(page.request, 63)
  const before = (await getLog(page.request)).dives.find(
    (one) => one.id === dive
  )!.siteId
  const keep = await newSite(page, restore, `E2E Two Mile ${tag}`)
  const duplicate = await newSite(page, restore, `E2E 2 Mile ${tag}`)
  restore((request) => patchDive(request, dive, { siteId: before }))
  await patchDive(page.request, dive, { siteId: duplicate })

  await page.goto(`/you/entities/site/${keep}`)
  await page
    .getByRole("button", { name: "Merge a duplicate into this" })
    .click()
  const sheet = page.getByRole("dialog")
  await still(sheet)
  await sheet.getByRole("textbox").fill(tag)
  await sheet.getByRole("radio", { name: new RegExp(`2 Mile ${tag}`) }).click()
  await expect(sheet).toContainText(
    `1 dive moves to E2E Two Mile ${tag} and “E2E 2 Mile ${tag}” is removed.`
  )
  await sheet.getByRole("button", { name: `Merge “E2E 2 Mile ${tag}”` }).click()
  await expect(sheet).toHaveCount(0)

  const log = await getLog(page.request)
  expect(log.dives.find((one) => one.id === dive)?.siteId).toBe(keep)
  expect(log.sites.some((site) => site.id === duplicate)).toBe(false)
  // The moved dive is now this site's one dive.
  await expect(
    page.getByRole("region", { name: "Dives" }).getByRole("link")
  ).toHaveCount(1)
  await page.goto(`/you/entities?kind=site&q=${tag}`)
  // Once the list is there, so the check isn't on an empty page.
  await expect(
    page.getByRole("link", { name: new RegExp(`^E2E Two Mile ${tag},`) })
  ).toBeVisible()
  await expect(page.getByText(`E2E 2 Mile ${tag}`)).toHaveCount(0)
})

test("lists regions with their sites count @writes", async ({
  page,
  restore,
}) => {
  const tag = unique()
  const region = `region-${crypto.randomUUID()}`
  await putEntity(page.request, "region", region, {
    name: `E2E Region ${tag}`,
    countryCode: "ZA",
  })
  restore((request) => deleteEntity(request, "region", region))
  await newSite(page, restore, `E2E Reef ${tag}`, { regionId: region })

  await page.goto("/you")
  await page.getByRole("link", { name: /^Regions/ }).click()
  await expect(page).toHaveURL(/kind=region/)
  await expect(
    page.getByRole("link", { name: `E2E Region ${tag}, 1 site` })
  ).toBeVisible()
})

// A person nothing uses yet, removed again when the test ends.
async function newPerson(
  page: Page,
  restore: (undo: (request: APIRequestContext) => Promise<void>) => void,
  name: string
) {
  const id = `person-${crypto.randomUUID()}`
  await putEntity(page.request, "person", id, { name })
  restore((request) => deleteEntity(request, "person", id))
  return id
}

// Dive 63 with `extra` added to its buddies, put back when the test ends.
async function addBuddy(
  page: Page,
  restore: (undo: (request: APIRequestContext) => Promise<void>) => void,
  extra: string
) {
  const dive = await diveId(page.request, 63)
  const buddies = (await getLog(page.request)).links
    .filter((link) => link.diveId === dive && link.type === "buddy")
    .sort((a, b) => a.position - b.position)
    .map((link) => link.target)
  restore((request) => patchDive(request, dive, { buddies }))
  await patchDive(page.request, dive, { buddies: [...buddies, extra] })
  return dive
}

test("deletes a person nothing uses @writes", async ({ page, restore }) => {
  const name = `E2E Person ${unique()}`
  const id = await newPerson(page, restore, name)
  await page.goto(`/you/entities?kind=person&q=${encodeURIComponent(name)}`)
  await page.getByRole("link", { name: new RegExp(`^${name}`) }).click()
  await page.getByRole("button", { name: "Delete person" }).click()
  const ask = page.getByRole("alertdialog", { name: `Delete ${name}?` })
  await still(ask)
  await ask.getByRole("button", { name: "Delete person" }).click()
  // Back to the list it was opened from.
  await expect(page).toHaveURL(/\/you\/entities\?kind=person/)
  const log = await getLog(page.request)
  expect(log.people.some((person) => person.id === id)).toBe(false)
})

test("won't delete a person a dive uses, and says why @writes", async ({
  page,
  restore,
}) => {
  const id = await newPerson(page, restore, `E2E Buddy ${unique()}`)
  await addBuddy(page, restore, id)
  await page.goto(`/you/entities/person/${id}`)
  await expect(
    page.getByRole("button", { name: "Delete person" })
  ).toBeDisabled()
  await expect(
    page.getByText(/^Used by 1 dive, so it can’t be deleted/)
  ).toBeVisible()
})

test("merges a duplicate buddy, moving their dives @writes", async ({
  page,
  restore,
}) => {
  const tag = unique()
  const keep = await newPerson(page, restore, `E2E Sam ${tag}`)
  const duplicate = await newPerson(page, restore, `E2E Samuel ${tag}`)
  const dive = await addBuddy(page, restore, duplicate)

  await page.goto(`/you/entities/person/${keep}`)
  await page
    .getByRole("button", { name: "Merge a duplicate into this" })
    .click()
  const sheet = page.getByRole("dialog")
  await still(sheet)
  await sheet.getByRole("textbox").fill(tag)
  await sheet.getByRole("radio", { name: new RegExp(`Samuel ${tag}`) }).click()
  await sheet.getByRole("button", { name: `Merge “E2E Samuel ${tag}”` }).click()
  await expect(sheet).toHaveCount(0)

  const log = await getLog(page.request)
  const buddies = log.links
    .filter((link) => link.diveId === dive && link.type === "buddy")
    .map((link) => link.target)
  expect(buddies).toContain(keep)
  expect(buddies).not.toContain(duplicate)
  expect(log.people.some((person) => person.id === duplicate)).toBe(false)
  await expect(
    page.getByRole("region", { name: "Dives" }).getByRole("link")
  ).toHaveCount(1)
})
