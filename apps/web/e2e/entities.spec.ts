import { expect, type APIRequestContext, type Page } from "@playwright/test"

import {
  deleteEntity,
  diveId,
  getLog,
  patchDive,
  putEntity,
  setEntityDives,
  test,
} from "./api"
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
  await page.getByRole("button", { name: `Merge into E2E Keep ${tag}` }).click()
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

// A fixture day with two dives that no other test changes, earlier first,
// and its heading in the dive picker. Pinned, so a change to the seed fails
// here rather than picking another day.
const twoDiveDate = "2019-02-10"
async function twoDiveDay(page: Page) {
  const dives = (await getLog(page.request)).dives
    .filter((dive) => dive.startTime.startsWith(twoDiveDate) && !dive.deletedAt)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
  expect(dives, "the fixture's day has two live dives").toHaveLength(2)
  return {
    label: "Sun 10 Feb",
    ids: dives.map((dive) => dive.id),
    times: dives.map((dive) => dive.startTime.slice(11, 16)),
  }
}

test("makes a trip from You with its dives @writes", async ({
  page,
  restore,
}) => {
  const name = `E2E Trip ${unique()}`
  const {
    label: sameDay,
    ids: [first, second],
  } = await twoDiveDay(page)
  // By name, so a save that landed before a later step failed is undone.
  restore(async (request) => {
    for (const trip of (await getLog(request)).trips)
      if (trip.name === name) await deleteEntity(request, "trip", trip.id)
  })

  await page.goto("/you/entities?kind=trip")
  await page.getByRole("link", { name: "New trip" }).click()
  await expect(page).toHaveURL(/\/you\/entities\/trip\/new$/)
  const save = page.getByRole("button", { name: "Save", exact: true })
  await page.getByLabel("Name").fill(name)
  // Nothing is saved without a dive.
  await expect(save).toBeDisabled()

  await page.getByRole("button", { name: "Choose dives" }).click()
  const sheet = page.getByRole("dialog")
  await still(sheet)
  await sheet.getByRole("button", { name: `Select all on ${sameDay}` }).click()
  await expect(sheet.getByRole("heading", { name: "2 dives" })).toBeVisible()
  await sheet.getByRole("button", { name: "Done" }).click()
  await expect(sheet).toHaveCount(0)
  await expect(
    page.getByRole("region", { name: "Dives" }).getByText(sameDay)
  ).toHaveCount(2)

  await save.click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name)
  const made = new URL(page.url()).pathname.split("/").at(-1)
  const log = await getLog(page.request)
  expect(log.trips.find((trip) => trip.id === made)?.name).toBe(name)
  expect(
    log.dives.filter((dive) => dive.tripId === made).map((dive) => dive.id)
  ).toEqual(expect.arrayContaining([first, second]))
  // The saved trip took the form's place, so Back returns to the list.
  await page.goBack()
  await expect(page).toHaveURL(/\/you\/entities\?kind=trip/)
})

test("adds a person to dives in the role chosen @writes", async ({
  page,
  restore,
}) => {
  const {
    label: sameDay,
    ids: [first, second],
  } = await twoDiveDay(page)
  const id = `person-${crypto.randomUUID()}`
  await setEntityDives(page.request, "person", id, {
    create: { name: `E2E Buddy ${unique()}` },
    add: [{ diveId: first, role: "buddy" }],
  })
  restore(async (request) => {
    await setEntityDives(request, "person", id, {
      remove: [first, second],
      deleteIfEmpty: true,
    })
  })

  await page.goto(`/you/entities/person/${id}`)
  await page.getByRole("button", { name: "Choose dives" }).click()
  const sheet = page.getByRole("dialog")
  await still(sheet)
  await sheet.getByRole("button", { name: "Pro", exact: true }).click()
  await sheet.getByRole("button", { name: `Select all on ${sameDay}` }).click()
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet).toHaveCount(0)

  // The dive already ticked kept its role; the new one took the choice.
  const links = (await getLog(page.request)).links
  expect(links).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ diveId: first, type: "buddy", target: id }),
      expect.objectContaining({
        diveId: second,
        type: "professional",
        target: id,
      }),
    ])
  )
})

test("unticking every dive deletes the trip after asking @writes", async ({
  page,
  restore,
}) => {
  const {
    ids: [first],
  } = await twoDiveDay(page)
  const id = `trip-${crypto.randomUUID()}`
  const name = `E2E Trip ${unique()}`
  await setEntityDives(page.request, "trip", id, {
    create: { name },
    add: [first],
  })
  restore((request) => deleteEntity(request, "trip", id))

  await page.goto(`/you/entities?kind=trip&q=${encodeURIComponent(name)}`)
  await page.getByRole("link", { name: new RegExp(`^${name},`) }).click()
  await page.getByRole("button", { name: "Choose dives" }).click()
  const sheet = page.getByRole("dialog").first()
  await still(sheet)
  await sheet.getByRole("checkbox", { checked: true }).click()
  await expect(
    sheet.getByRole("heading", { name: "Choose dives" })
  ).toBeVisible()
  await sheet.getByRole("button", { name: "Save" }).click()
  const ask = page.getByRole("alertdialog")
  await expect(ask).toContainText(`Delete ${name}?`)
  await ask.getByRole("button", { name: "Delete trip" }).click()
  await expect(page).toHaveURL(/\/you\/entities\?kind=trip/)
  await expect(
    page.getByRole("link", { name: new RegExp(`^${name},`) })
  ).toHaveCount(0)
  const log = await getLog(page.request)
  expect(log.trips.some((trip) => trip.id === id)).toBe(false)
  expect(log.dives.find((dive) => dive.id === first)?.tripId).toBeNull()
})

test("offers the trip holding the name for a new one's dives @writes", async ({
  page,
  restore,
}) => {
  const {
    label: sameDay,
    ids: [first, second],
  } = await twoDiveDay(page)
  const id = `trip-${crypto.randomUUID()}`
  const name = `E2E Trip ${unique()}`
  await setEntityDives(page.request, "trip", id, {
    create: { name },
    add: [first],
  })
  restore((request) => deleteEntity(request, "trip", id))

  await page.goto("/you/entities?kind=trip")
  await page.getByRole("link", { name: "New trip" }).click()
  await page.getByLabel("Name").fill(name.toLowerCase())
  await page.getByRole("button", { name: "Choose dives" }).click()
  const sheet = page.getByRole("dialog")
  await still(sheet)
  await sheet.getByRole("button", { name: `Select all on ${sameDay}` }).click()
  await sheet.getByRole("button", { name: "Done" }).click()
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(
    page.getByText(`There is already a trip called ${name}`)
  ).toBeVisible()
  await page.getByRole("button", { name: `Add these dives to ${name}` }).click()
  await expect(page).toHaveURL(new RegExp(`/you/entities/trip/${id}$`))
  const log = await getLog(page.request)
  expect(
    log.dives.filter((dive) => dive.tripId === id).map((dive) => dive.id)
  ).toEqual(expect.arrayContaining([first, second]))
  // The trip took the form's place, so Back returns to the list.
  await page.goBack()
  await expect(page).toHaveURL(/\/you\/entities\?kind=trip/)
})

test("moves a dive from its dive centre to a new one @writes", async ({
  page,
  restore,
}) => {
  const {
    label: sameDay,
    ids: [first, second],
    times: [firstTime],
  } = await twoDiveDay(page)
  const tag = unique()
  const old = `centre-${crypto.randomUUID()}`
  await setEntityDives(page.request, "diveCentre", old, {
    create: { name: `E2E Old Centre ${tag}` },
    add: [first],
  })
  const name = `E2E New Centre ${tag}`
  // Off their dives first, as a dive centre in use can't be deleted.
  restore(async (request) => {
    for (const centre of (await getLog(request)).diveCentres)
      if (centre.id === old || centre.name === name)
        await setEntityDives(request, "diveCentre", centre.id, {
          remove: [first, second],
          deleteIfEmpty: true,
        })
  })

  await page.goto("/you/entities?kind=diveCentre")
  await page.getByRole("link", { name: "New dive centre" }).click()
  await page.getByLabel("Name").fill(name)
  await page.getByRole("button", { name: "Choose dives" }).click()
  const sheet = page.getByRole("dialog")
  await still(sheet)
  // The dive in another centre names it, and says it will move once ticked.
  const moving = sheet.getByRole("checkbox", {
    name: new RegExp(`E2E Old Centre ${tag}`),
  })
  await expect(moving).toHaveCount(1)
  // The day heading gives the date, so a row tells its dive by start time.
  await expect(moving).toContainText(firstTime)
  await sheet.getByRole("button", { name: `Select all on ${sameDay}` }).click()
  await expect(moving).toContainText(`Moves from E2E Old Centre ${tag}`)
  await sheet.getByRole("button", { name: "Done" }).click()
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name)

  const log = await getLog(page.request)
  const made = log.diveCentres.find((centre) => centre.name === name)!.id
  expect(
    log.dives
      .filter((dive) => dive.diveCentreId === made)
      .map((dive) => dive.id)
  ).toEqual(expect.arrayContaining([first, second]))
})
