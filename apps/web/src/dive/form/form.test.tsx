import { act } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { defaultSettings, diveFieldsSchema, sacRate } from "@shylog/core"

import { formFigures } from "./calculated"
import { DiveForm } from "./dive-form"
import { button, click, render, testDive, testLog, type } from "./testing"
import {
  changedFields,
  copyFromDive,
  emptyValues,
  fromDive,
  intervalParts,
  newDiveValues,
  toFields,
  usedEntities,
  type FormValues,
} from "./values"

const filled = (values: Partial<FormValues> = {}): FormValues => ({
  ...emptyValues("2026-07-22"),
  time: "08:10",
  siteId: "site-za-long-beach",
  duration: "42",
  maxDepth: "32.7",
  ...values,
})

afterEach(() => {
  document.body.innerHTML = ""
})

describe("the form's fields", () => {
  it("requires date, time, site, duration and max depth", () => {
    const { errors } = toFields(emptyValues("2026-07-22"))
    expect(Object.keys(errors).sort()).toEqual(
      ["duration", "maxDepth", "siteId", "time"].sort()
    )
    // The date always has a value: today, until changed.
    expect(emptyValues("2026-07-22").date).toBe("2026-07-22")
    expect(toFields(filled()).errors).toEqual({})
  })

  it("lists errors in the form's order, so Save scrolls to the topmost", () => {
    const { errors } = toFields(emptyValues("2026-07-22"))
    expect(Object.keys(errors)[0]).toBe("siteId")
  })

  it("splits an interval into whole hours and minutes, never 60 minutes", () => {
    expect(intervalParts(7170)).toEqual({ hours: "2", minutes: "0" })
    expect(intervalParts(7800)).toEqual({ hours: "2", minutes: "10" })
  })

  it("creates only the entities the dive still uses", () => {
    const region = {
      kind: "region",
      id: "region-new",
      fields: { name: "Kalk Bay", countryCode: "ZA" },
    } as const
    const site = {
      kind: "site",
      id: "site-new",
      fields: { name: "Roman Rock", countryCode: "ZA", regionId: "region-new" },
    } as const
    const bob = {
      kind: "person",
      id: "person-bob",
      fields: { name: "Bob" },
    } as const
    const created = [region, site, bob]
    // Bob was added, then removed again.
    expect(usedEntities(filled({ siteId: "site-new" }), created)).toEqual([
      region,
      site,
    ])
    // The new site was swapped for an existing one, so its region goes too.
    expect(usedEntities(filled({ buddies: ["person-bob"] }), created)).toEqual([
      bob,
    ])
  })

  it("shows core's limits under the field, in the form's units", () => {
    const { errors } = toFields(
      filled({
        maxDepth: "3270",
        duration: "1500",
        cylinderVolume: "24",
        startPressure: "60",
        endPressure: "200",
        visibility: "metres",
        visibilityMetres: "200",
      })
    )
    expect(errors).toMatchObject({
      maxDepth: "Up to 350 m",
      duration: "Up to 24 h",
      cylinderVolume: "Up to 20 L",
      endPressure: "Above the start pressure",
      visibilityMetres: "Up to 150 m",
    })
  })

  it("reads a comma as the decimal point", () => {
    const { fields } = toFields(
      filled({ maxDepth: "32,7", averageDepth: "21,1" })
    )
    expect(fields.maxDepth).toBe(32.7)
    expect(fields.averageDepth).toBe(21.1)
  })

  it("saves training agency and course only for a Training dive", () => {
    const training = { trainingAgency: "PADI", trainingCourse: "Deep" }
    const kept = toFields(filled({ ...training, diveType: "training" })).fields
    expect(kept).toMatchObject(training)
    const other = toFields(
      filled({ ...training, diveType: "recreation" })
    ).fields
    expect(other).not.toHaveProperty("trainingAgency")
    expect(other).not.toHaveProperty("trainingCourse")
  })

  it("takes visibility in metres or as a rating, never both", () => {
    const metres = toFields(
      filled({ visibility: "metres", visibilityMetres: "20" })
    ).fields
    expect(metres).toMatchObject({ visibility: 20 })
    expect(metres).not.toHaveProperty("visibilityRating")
    const rating = toFields(
      filled({ visibility: "average", visibilityMetres: "20" })
    ).fields
    expect(rating).toMatchObject({ visibilityRating: "average" })
    expect(rating).not.toHaveProperty("visibility")
  })

  it("saves no oxygen with Nitrox off, and needs it with Nitrox on", () => {
    expect(toFields(filled({ oxygen: "32" })).fields).not.toHaveProperty(
      "oxygen"
    )
    expect(toFields(filled({ nitrox: true })).errors.oxygen).toBe(
      "Required for nitrox"
    )
    expect(
      toFields(filled({ nitrox: true, oxygen: "32,4" })).fields.oxygen
    ).toBe(324)
  })

  it("refuses a figure that rounds to one the schema refuses", () => {
    expect(
      toFields(filled({ nitrox: true, oxygen: "21,04" })).errors.oxygen
    ).toBe("Between 21.1 and 100")
    expect(
      toFields(filled({ cylinderVolume: "0,0001" })).errors.cylinderVolume
    ).toBe("Too small")
  })

  it("passes core's dive schema once filled in", () => {
    const { fields } = toFields(
      filled({
        nitrox: true,
        oxygen: "32",
        startPressure: "200",
        tags: ["drift"],
      })
    )
    expect(diveFieldsSchema.safeParse(fields).success).toBe(true)
  })
})

describe("the calculated block", () => {
  // Fixture dive 63 as typed: EANx32 to 32.66 m for 42 min, averaging
  // 21.0 m, with pressures the D4i doesn't record.
  const dive63 = filled({
    maxDepth: "32.66",
    averageDepth: "21",
    nitrox: true,
    oxygen: "32",
    cylinderVolume: "11.1",
  })
  const options = {
    water: { waterType: "salt" } as const,
    settings: defaultSettings,
    handDuration: true,
    handAverageDepth: true,
  }

  it("shows dive 63's max PO₂ and MOD, and SAC once its pressures are typed", () => {
    const before = formFigures(dive63, options)
    expect(before.maxPo2?.toFixed(2)).toBe("1.38")
    expect(before.mod).toBe(33.2)
    expect(before.sac).toBeNull()

    const typed = formFigures(
      { ...dive63, startPressure: "200", endPressure: "60" },
      options
    )
    const expected = sacRate(
      {
        startPressure: 200,
        endPressure: 60,
        cylinderVolume: 11100,
        oxygen: 320,
        duration: 2520,
        averageDepth: 21,
      },
      { waterType: "salt" }
    )
    expect(typed.sac).toBe(expected)
    // About 11.2 to 11.3 L/min, as docs/design/NOTES.md works it out.
    expect(typed.sac!.toFixed(1)).toBe("11.3")
  })

  it("highlights max PO₂ over the setting", () => {
    const deep = formFigures({ ...dive63, maxDepth: "40" }, options)
    expect(deep.po2Over).toBe(true)
    expect(formFigures(dive63, options).po2Over).toBe(false)
  })
})

describe("a new dive", () => {
  const settings = {
    ...defaultSettings,
    newDiveDefaults: {
      cylinderMaterial: "aluminium",
      cylinderVolume: 11100,
      startPressure: 200,
      nitrox: true,
      oxygen: 320,
      weight: 6,
      diveType: "training",
      visibilityMode: "rating",
    },
  } as typeof defaultSettings

  it("fills in the new-dive defaults as typed values, and today's date", () => {
    const values = newDiveValues(settings, "2026-10-27")
    expect(values).toMatchObject({
      date: "2026-10-27",
      time: "",
      cylinderMaterial: "aluminium",
      cylinderVolume: "11.1",
      startPressure: "200",
      nitrox: true,
      oxygen: "32",
      weight: "6",
      diveType: "training",
      visibility: null,
      ignored: false,
    })
    // Typed values like any other, so they are sent with the dive.
    const { fields } = toFields({
      ...values,
      time: "09:00",
      siteId: "site-two-mile",
      duration: "40",
      maxDepth: "18",
    })
    expect(fields).toMatchObject({
      cylinderVolume: 11100,
      startPressure: 200,
      oxygen: 320,
      weight: 6,
    })
  })

  it("copies the setting and kit of the last dive, never its numbers or Ignore", () => {
    const last = testDive({
      id: "dive-last",
      siteId: "site-two-mile",
      tripId: "trip-sodwana",
      diveCentreId: "centre-coral",
      entry: "smallBoat",
      weight: 6,
      cylinderMaterial: "aluminium",
      cylinderVolume: 11100,
      nitrox: true,
      oxygen: 320,
      gearDetails: "5 mm suit",
      current: "moderate",
      surge: "mild",
      surface: "moving",
      weather: "cloudless",
      visibility: 20,
      maxDepth: 32.7,
      duration: 2700,
      startPressure: 200,
      endPressure: 60,
      minTemperature: 22,
      notableAnimals: "Turtles",
      notes: "Drift",
      ignored: true,
    })
    const log = testLog({
      dives: [last],
      links: [
        { diveId: "dive-last", type: "buddy", target: "person-sam" },
        { diveId: "dive-last", type: "professional", target: "person-lerato" },
        { diveId: "dive-last", type: "tag", target: "drift" },
      ],
    })
    const copied = copyFromDive(emptyValues("2026-10-27"), last, log)
    expect(copied).toMatchObject({
      siteId: "site-two-mile",
      tripId: "trip-sodwana",
      buddies: ["person-sam"],
      diveProfessionals: ["person-lerato"],
      diveCentreId: "centre-coral",
      entry: "smallBoat",
      weight: "6",
      cylinderMaterial: "aluminium",
      cylinderVolume: "11.1",
      nitrox: true,
      oxygen: "32",
      gearDetails: "5 mm suit",
      current: "moderate",
      surge: "mild",
      surface: "moving",
      weather: "cloudless",
      visibility: "metres",
      visibilityMetres: "20",
      tags: ["drift"],
    })
    expect(copied).toMatchObject({
      date: "2026-10-27",
      time: "",
      duration: "",
      maxDepth: "",
      averageDepth: "",
      startPressure: "",
      endPressure: "",
      minTemperature: "",
      maxTemperature: "",
      notableAnimals: "",
      notes: "",
      ignored: false,
    })
  })

  it("shows the date as text and starts the time picker at 09:00", () => {
    const log = testLog()
    render(
      <DiveForm
        title="New dive"
        log={log}
        initial={newDiveValues(log.settings, "2026-10-27")}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const date = document.querySelector<HTMLInputElement>("#field-date")!
    // The native picker sits invisibly over the date written out.
    expect(date.className).toContain("opacity-0")
    expect(date.parentElement!.textContent).toContain("Tue 27 Oct 2026")
    const time = document.querySelector<HTMLInputElement>("#field-time")!
    expect(time.value).toBe("")
    expect(time.parentElement!.textContent).toContain("Required")
    act(() => {
      time.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }))
    })
    // Set before the picker opens, so it starts there.
    expect(document.querySelector<HTMLInputElement>("#field-time")!.value).toBe(
      "09:00"
    )
  })

  it("keeps the Ignore switch off, whatever the defaults or copied dive", () => {
    const log = testLog({
      dives: [testDive({ id: "dive-last", ignored: true })],
    })
    render(
      <DiveForm
        title="New dive"
        log={log}
        initial={newDiveValues(log.settings, "2026-10-27")}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    click(button(/Copy from last dive/))
    const ignored = document.querySelector<HTMLInputElement>("#field-ignored")!
    expect(ignored.checked).toBe(false)
  })
})

describe("a synced dive", () => {
  it("sends ignored in the PATCH when Ignore is turned on", () => {
    const dive = testDive({ id: "dive-a" })
    const before = fromDive(dive, testLog({ dives: [dive] }))
    expect(changedFields(before, { ...before, ignored: true })).toEqual({
      ignored: true,
    })
  })

  it("sends only what changed, clearing an emptied field with null", () => {
    const dive = testDive({ id: "dive-a", notes: "Drift", weight: 6 })
    const before = fromDive(dive, testLog({ dives: [dive] }))
    expect(changedFields(before, before)).toEqual({})
    expect(
      changedFields(before, { ...before, notes: "", maxDepth: "21.5" })
    ).toEqual({ notes: null, maxDepth: 21.5 })
  })
})

describe("the surface interval", () => {
  const dive = testDive({ id: "dive-si", surfaceInterval: 7800 })
  const log = testLog({ dives: [dive] })
  const show = () => {
    const onSave = vi.fn((values: FormValues) => {
      void values
      return Promise.resolve()
    })
    render(
      <DiveForm
        title="Edit dive"
        log={log}
        dive={dive}
        original={fromDive(dive, log)}
        initial={fromDive(dive, log)}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    )
    click(document.querySelector("#field-surfaceInterval"))
    return onSave
  }

  it("opens on the calculated figure without overriding it", async () => {
    const onSave = show()
    expect(
      document.querySelector<HTMLInputElement>("#field-surfaceInterval")!.value
    ).toBe("2")
    await act(async () => button("Save")!.click())
    expect(onSave.mock.calls[0][0].surfaceInterval).toBeNull()
  })

  it("overrides it once something is typed", async () => {
    const onSave = show()
    type(document.querySelector('input[aria-label="Minutes"]'), "30")
    await act(async () => button("Save")!.click())
    expect(onSave.mock.calls[0][0].surfaceInterval).toEqual({
      hours: "2",
      minutes: "30",
    })
  })
})

describe("the form on screen", () => {
  const dive = testDive({
    id: "dive-a",
    maxDepth: 32.66,
    averageDepth: 21.005,
    computerModel: "Suunto D4i",
  })
  const log = testLog({
    dives: [dive],
    meta: [
      {
        diveId: "dive-a",
        field: "maxDepth",
        source: "computer",
        computerValue: null,
        dismissed: false,
      },
    ],
  })
  const show = () =>
    render(
      <DiveForm
        title="Edit dive"
        log={log}
        dive={dive}
        original={fromDive(dive, log)}
        initial={fromDive(dive, log)}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )

  it("labels the free text General under the Notes heading", () => {
    show()
    const notes = document.querySelector("#form-notes")!
    expect(notes.textContent).toBe("Notes")
    const general = document.querySelector('label[for="field-notes"]')!
    expect(general.textContent).toBe("General")
    expect(notes.closest("section")!.contains(general)).toBe(true)
  })

  it("shows computer values in the normal text colour, with only a marker", () => {
    show()
    const maxDepth =
      document.querySelector<HTMLInputElement>("#field-maxDepth")!
    expect(maxDepth.value).toBe("32.7")
    expect(maxDepth.className).not.toMatch(/text-primary|accent/)
    const label = maxDepth.closest("div")!
    expect(label.querySelector('[title="From the D4i"]')).not.toBeNull()
  })

  it("shows a save error with Try again, keeping the values", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("Couldn't reach Shylog. Check your connection.")
      )
      .mockResolvedValueOnce(undefined)
    render(
      <DiveForm
        title="Edit dive"
        log={log}
        dive={dive}
        original={fromDive(dive, log)}
        initial={fromDive(dive, log)}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    )
    type(document.querySelector("#field-notes"), "Strong drift")
    await act(async () => button("Save")!.click())
    // A frame on, the alert scrolls into view (reading matchMedia).
    await act(() => new Promise(requestAnimationFrame))
    expect(document.body.textContent).toContain("Couldn't reach Shylog")
    expect(
      document.querySelector<HTMLTextAreaElement>("#field-notes")!.value
    ).toBe("Strong drift")
    await act(async () => button("Try again")!.click())
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onSave.mock.calls[1][0].notes).toBe("Strong drift")
  })
})

describe("Cancel", () => {
  const dive = testDive({ id: "dive-c", notes: "Drift" })
  const log = testLog({ dives: [dive] })
  const show = () => {
    const onCancel = vi.fn()
    render(
      <DiveForm
        title="Edit dive"
        log={log}
        dive={dive}
        original={fromDive(dive, log)}
        initial={fromDive(dive, log)}
        onSave={vi.fn()}
        onCancel={onCancel}
      />
    )
    return onCancel
  }

  it("closes an untouched form at once", () => {
    const onCancel = show()
    click(button("Cancel"))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("asks before discarding changes, and Keep editing keeps them", () => {
    const onCancel = show()
    type(document.querySelector("#field-notes"), "Strong drift")
    click(button("Cancel"))
    expect(onCancel).not.toHaveBeenCalled()
    click(button("Keep editing"))
    expect(onCancel).not.toHaveBeenCalled()
    expect(
      document.querySelector<HTMLTextAreaElement>("#field-notes")!.value
    ).toBe("Strong drift")
    click(button("Cancel"))
    click(button("Discard changes"))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
