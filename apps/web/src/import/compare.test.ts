import type { ComputerDive } from "@shylog/core"
import { describe, expect, it } from "vitest"

import type { Dive } from "@/data/db"

import { compareRows } from "./compare"

const computer = (oxygen: number | null | undefined): ComputerDive => ({
  ref: "c1",
  day: "2026-07-25",
  computerStartTime: "2026-07-25T09:14:00",
  startTime: "2026-07-25T09:14:00",
  duration: 2700,
  maxDepth: 18,
  averageDepth: 11,
  minTemperature: 20,
  maxTemperature: 22,
  profile: null,
  oxygen,
  site: null,
  unsupportedGas: false,
})

const hand = (gas: Pick<Dive, "nitrox" | "oxygen">) =>
  ({
    startTime: "2026-07-25T09:14:00",
    duration: 2700,
    maxDepth: 18,
    ...gas,
  }) as Dive

const gas = (computerDive: ComputerDive, dive: Dive) =>
  compareRows(computerDive, dive).find((row) => row.key === "gas")!

describe("the Compare table's gas", () => {
  it("doesn't flag a hand Nitrox no, which takes the computer's nitrox", () => {
    expect(
      gas(computer(320), hand({ nitrox: false, oxygen: null }))
    ).toMatchObject({
      mine: "Air",
      theirs: "Nitrox 32.0%",
      differs: false,
    })
  })

  it("flags a hand nitrox against the computer's air or another mix", () => {
    expect(
      gas(computer(null), hand({ nitrox: true, oxygen: 320 })).differs
    ).toBe(true)
    expect(
      gas(computer(360), hand({ nitrox: true, oxygen: 320 })).differs
    ).toBe(true)
    expect(
      gas(computer(320), hand({ nitrox: true, oxygen: 324 })).differs
    ).toBe(false)
  })

  it("doesn't flag an unsupported gas, which the import never compares", () => {
    expect(
      gas(
        { ...computer(null), unsupportedGas: true },
        hand({ nitrox: true, oxygen: 320 })
      ).differs
    ).toBe(false)
  })

  it("shows no gas for a preview stored before the review had it", () => {
    expect(
      gas(computer(undefined), hand({ nitrox: true, oxygen: 320 }))
    ).toMatchObject({ theirs: "—", differs: false })
  })
})
