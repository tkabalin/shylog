import { describe, expect, it } from "vitest"

import {
  barToPascals,
  celsiusToKelvin,
  cubicMetresToMillilitres,
  fractionToTenths,
  kelvinToCelsius,
  litresToMillilitres,
  millilitresToCubicMetres,
  millilitresToLitres,
  minutesToSeconds,
  parseDecimal,
  parseWhole,
  pascalsToBar,
  percentToTenths,
  secondsToMinutes,
  tenthsToFraction,
  tenthsToPercent,
} from "./units.ts"

describe("conversions", () => {
  it("stores gas in tenths of a per cent", () => {
    expect(percentToTenths(32.4)).toBe(324)
    expect(tenthsToPercent(324)).toBe(32.4)
    expect(percentToTenths(20.9)).toBe(209)
    expect(tenthsToFraction(324)).toBe(0.324)
    expect(fractionToTenths(0.32)).toBe(320)
    expect(fractionToTenths(0.21)).toBe(210)
  })

  it("stores cylinder volume in millilitres", () => {
    expect(litresToMillilitres(11.1)).toBe(11100)
    expect(millilitresToLitres(11100)).toBe(11.1)
    expect(millilitresToCubicMetres(11100)).toBe(0.0111)
    expect(cubicMetresToMillilitres(0.0111)).toBe(11100)
  })

  it("writes temperatures in kelvin", () => {
    expect(celsiusToKelvin(22.3)).toBe(295.45)
    expect(kelvinToCelsius(295.45)).toBe(22.3)
    expect(kelvinToCelsius(284.15)).toBe(11)
    expect(celsiusToKelvin(-1.5)).toBe(271.65)
  })

  it("writes pressures in pascals", () => {
    expect(barToPascals(1)).toBe(100000)
    expect(pascalsToBar(100000)).toBe(1)
    expect(barToPascals(200)).toBe(20_000_000)
    expect(pascalsToBar(101300)).toBe(1.013)
  })

  it("stores durations in seconds", () => {
    expect(minutesToSeconds(45)).toBe(2700)
    expect(secondsToMinutes(2700)).toBe(45)
  })
})

describe("parseDecimal", () => {
  it("reads a comma or a point as the decimal separator", () => {
    expect(parseDecimal("32,4")).toBe(32.4)
    expect(parseDecimal("32.4")).toBe(32.4)
    expect(parseDecimal(" 12 ")).toBe(12)
    expect(parseDecimal(",5")).toBe(0.5)
    expect(parseDecimal("-1,5")).toBe(-1.5)
    expect(Object.is(parseDecimal("-0"), 0)).toBe(true)
  })

  it.each(["", "abc", "1.234,5", "1,234.5", "1,2,3", "3e2", "--1", "12 m"])(
    "rejects %j",
    (text) => {
      expect(parseDecimal(text)).toBeNull()
    }
  )
})

describe("parseWhole", () => {
  it("reads digits", () => {
    expect(parseWhole("45")).toBe(45)
    expect(parseWhole(" 200 ")).toBe(200)
  })

  it.each(["4,5", "4.5", "-3", "", "1e3"])("rejects %j", (text) => {
    expect(parseWhole(text)).toBeNull()
  })
})
