import { describe, expect, it } from "vitest"

import { clientReportSchema, cutToBytes } from "./client-log.ts"

describe("cutToBytes", () => {
  it("leaves text that fits", () => {
    expect(cutToBytes("abc", 3)).toBe("abc")
  })

  it("cuts to the byte count", () => {
    expect(cutToBytes("abcdef", 4)).toBe("abcd")
  })

  it("never splits a character", () => {
    // "é" is two bytes, so a cut after its first byte drops it whole.
    expect(cutToBytes("aé", 2)).toBe("a")
    expect(cutToBytes("aé", 3)).toBe("aé")
    expect(cutToBytes("a€b", 3)).toBe("a")
    expect(cutToBytes("a€b", 4)).toBe("a€")
    // Four bytes, cut after three.
    expect(cutToBytes("a🐠b", 4)).toBe("a")
    expect(cutToBytes("a🐠b", 5)).toBe("a🐠")
  })
})

describe("clientReportSchema", () => {
  it("drops fields it doesn't know", () => {
    const report = clientReportSchema.parse({
      kind: "error",
      message: "Boom",
      notes: "Saw a shark",
    })
    expect(report).toEqual({ kind: "error", message: "Boom" })
  })

  it("cuts the message to 2 KB and the stack to 8 KB", () => {
    const report = clientReportSchema.parse({
      kind: "rejection",
      message: "m".repeat(5000),
      stack: "s".repeat(20000),
    })
    expect(report.message).toHaveLength(2048)
    expect(report.stack).toHaveLength(8192)
  })

  it("takes a request id only in the app's shape", () => {
    const ok = { kind: "sync", message: "x", requestId: "a1b2c3d4-e5f6" }
    expect(clientReportSchema.safeParse(ok).success).toBe(true)
    const bad = { ...ok, requestId: "<script>" }
    expect(clientReportSchema.safeParse(bad).success).toBe(false)
  })

  it("refuses an unknown kind", () => {
    const report = { kind: "info", message: "x" }
    expect(clientReportSchema.safeParse(report).success).toBe(false)
  })
})
