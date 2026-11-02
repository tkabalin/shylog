import { describe, expect, it } from "vitest"

import { leaf } from "./xml.ts"

describe("leaf", () => {
  // Found by the round-trip fuzzer: a visibility typed as 0.0000001.
  it("writes small numbers as plain decimals that read back exactly", () => {
    for (const [value, text] of [
      [1e-7, "0.0000001"],
      [1.25e-7, "0.000000125"],
      [-3e-8, "-0.00000003"],
      [0.000001, "0.000001"],
      [32.66, "32.66"],
      [0, "0"],
    ] as const) {
      expect(leaf("v", value)).toEqual([`<v>${text}</v>`])
      expect(Number(text)).toBe(value)
    }
    const tiniest = leaf("v", 5e-324)![0].slice(3, -4)
    expect(tiniest).toMatch(/^0\.0+5$/)
    expect(Number(tiniest)).toBe(5e-324)
  })
})
