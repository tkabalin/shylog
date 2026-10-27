import { act } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { FieldMeta } from "@/data/db"

import { DiveForm } from "./dive-form"
import { button, click, render, testDive, testLog, type } from "./testing"
import { changedFields, differences, fromDive, type FormValues } from "./values"

// A dive paired with the D4i: max depth and duration typed by hand and
// different from the computer's, average depth and the minimum temperature
// straight from the computer.
const dive = testDive({
  id: "dive-a",
  maxDepth: 33,
  duration: 2700,
  averageDepth: 21,
  minTemperature: 22,
  computerModel: "Suunto D4i",
})
const meta: FieldMeta[] = [
  {
    diveId: "dive-a",
    field: "maxDepth",
    source: "hand",
    computerValue: 32.66,
    dismissed: false,
  },
  {
    diveId: "dive-a",
    field: "duration",
    source: "hand",
    computerValue: 2640,
    dismissed: false,
  },
  {
    diveId: "dive-a",
    field: "averageDepth",
    source: "computer",
    computerValue: null,
    dismissed: false,
  },
  {
    diveId: "dive-a",
    field: "minTemperature",
    source: "computer",
    computerValue: null,
    dismissed: false,
  },
]
const log = testLog({ dives: [dive], meta })

function show() {
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
  return onSave
}
const group = (what: string) =>
  document.querySelector(`[aria-label="The D4i recorded a different ${what}"]`)
const save = async (onSave: ReturnType<typeof show>) => {
  await act(async () => button("Save")!.click())
  return onSave.mock.calls.at(-1)![0]
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("values that differ from the computer", () => {
  it("shows the ✓/✕ group for each difference", () => {
    show()
    expect(group("max depth")!.textContent).toContain("D4i: 32.7 m")
    expect(group("duration")!.textContent).toContain("D4i: 44 min")
    expect(group("average depth")).toBeNull()
  })

  it("✓ uses the computer's value and marks it from the computer", async () => {
    const onSave = show()
    click(button("Use D4i value", group("max depth")!))
    expect(group("max depth")).toBeNull()
    const input = document.querySelector<HTMLInputElement>("#field-maxDepth")!
    expect(input.value).toBe("32.7")
    expect(
      input.closest("div")!.querySelector('[title="From the D4i"]')
    ).not.toBeNull()

    const values = await save(onSave)
    expect(values.adopt).toEqual(["maxDepth"])
    // Adopted, not typed: the edit carries it in `adopt` alone.
    expect(changedFields(fromDive(dive, log), values)).toEqual({})
  })

  it("✕ keeps yours and hides the group", async () => {
    const onSave = show()
    click(button("Keep mine", group("duration")!))
    expect(group("duration")).toBeNull()
    expect(
      document.querySelector<HTMLInputElement>("#field-duration")!.value
    ).toBe("45")
    const values = await save(onSave)
    expect(values.dismiss).toEqual(["duration"])
    expect(values.adopt).toEqual([])
  })

  it("typing over an adopted value makes it typed again", async () => {
    const onSave = show()
    click(button("Use D4i value", group("max depth")!))
    type(document.querySelector("#field-maxDepth"), "32.5")
    const values = await save(onSave)
    expect(values.adopt).toEqual([])
    expect(changedFields(fromDive(dive, log), values)).toEqual({
      maxDepth: 32.5,
    })
  })
})

describe("a field holding the computer's value", () => {
  it("shows the marker, which becomes a reset once edited", () => {
    show()
    const row = () =>
      document.querySelector("#field-averageDepth")!.closest("div")!
    expect(row().querySelector('[title="From the D4i"]')).not.toBeNull()
    type(document.querySelector("#field-averageDepth"), "20")
    expect(row().querySelector('[title="From the D4i"]')).toBeNull()
    click(button("Reset to the D4i value", row()))
    expect(
      document.querySelector<HTMLInputElement>("#field-averageDepth")!.value
    ).toBe("21")
    expect(row().querySelector('[title="From the D4i"]')).not.toBeNull()
  })
})

describe("the detail's banner", () => {
  it("counts the differences not yet answered", () => {
    expect(differences(dive, log.fieldMeta.get("dive-a"))).toEqual([
      "maxDepth",
      "duration",
    ])
    const dismissed = new Map(log.fieldMeta.get("dive-a"))
    dismissed.set("duration", {
      ...dismissed.get("duration")!,
      dismissed: true,
    })
    expect(differences(dive, dismissed)).toEqual(["maxDepth"])
  })

  it("leaves out a hand value that matches as the form shows it", () => {
    // 32.7 by hand against the computer's 32.66 reads the same.
    const rounded = { ...dive, maxDepth: 32.7 }
    expect(differences(rounded, log.fieldMeta.get("dive-a"))).toEqual([
      "duration",
    ])
  })

  it("leaves out a hand value that has come to match", () => {
    const matching = { ...dive, maxDepth: 32.66 }
    expect(differences(matching, log.fieldMeta.get("dive-a"))).toEqual([
      "duration",
    ])
  })
})

describe("typing after answering a difference", () => {
  it("saves a value typed after Keep mine", async () => {
    const onSave = show()
    click(button("Keep mine", group("duration")!))
    type(document.querySelector("#field-duration"), "50")
    const values = await save(onSave)
    expect(values.dismiss).toEqual([])
    expect(changedFields(fromDive(dive, log), values)).toEqual({
      duration: 3000,
    })
  })

  it("saves a time typed after using the computer's start time", async () => {
    const timed = testDive({
      id: "dive-t",
      startTime: "2026-07-22T08:10:00",
      computerModel: "Suunto D4i",
    })
    const timedLog = testLog({
      dives: [timed],
      meta: [
        {
          diveId: "dive-t",
          field: "startTime",
          source: "hand",
          computerValue: "2026-07-22T08:12:19",
          dismissed: false,
        },
      ],
    })
    const onSave = vi.fn((values: FormValues) => {
      void values
      return Promise.resolve()
    })
    render(
      <DiveForm
        title="Edit dive"
        log={timedLog}
        dive={timed}
        original={fromDive(timed, timedLog)}
        initial={fromDive(timed, timedLog)}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    )
    click(button("Use D4i value", group("start time")!))
    type(document.querySelector("#field-time"), "10:15")
    const values = await save(onSave)
    expect(values.adopt).toEqual([])
    expect(changedFields(fromDive(timed, timedLog), values)).toEqual({
      startTime: "2026-07-22T10:15:00",
    })
  })
})
