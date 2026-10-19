import { describe, expect, it } from "vitest"

import { intDiv, lrint } from "./round.ts"

describe("lrint", () => {
  it("rounds halves to the even neighbour, as C does", () => {
    expect(lrint(0.5)).toBe(0)
    expect(lrint(1.5)).toBe(2)
    expect(lrint(2.5)).toBe(2)
    expect(lrint(4313.5)).toBe(4314)
    expect(lrint(-0.5)).toBe(0)
    expect(lrint(-1.5)).toBe(-2)
    expect(lrint(-2.5)).toBe(-2)
  })

  it("rounds everything else to the nearest integer", () => {
    expect(lrint(4313.06)).toBe(4313)
    expect(lrint(2.4999)).toBe(2)
    expect(lrint(2.5001)).toBe(3)
    expect(lrint(-2.6)).toBe(-3)
    expect(lrint(7)).toBe(7)
  })
})

describe("intDiv", () => {
  it("truncates towards zero, as C's integer division does", () => {
    expect(intDiv(7, 2)).toBe(3)
    expect(intDiv(-7, 2)).toBe(-3)
    expect(intDiv(7, -2)).toBe(-3)
    expect(intDiv(6, 3)).toBe(2)
    expect(intDiv(-1, 2)).toBe(0)
  })
})
