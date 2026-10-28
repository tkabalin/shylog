import { afterEach, describe, expect, it, vi } from "vitest"

import { raiseKeyboard } from "./keyboard"

const pointer = (coarse: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: coarse && query === "(pointer: coarse)",
  }))

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe("raiseKeyboard", () => {
  it("focuses a stand-in on a touch screen, gone once focus moves on", () => {
    pointer(true)
    const field = document.createElement("input")
    document.body.append(field)
    raiseKeyboard()
    const standIn = document.activeElement as HTMLInputElement
    expect(standIn).not.toBe(field)
    expect(standIn.tagName).toBe("INPUT")
    expect(standIn.style.fontSize).toBe("16px")
    field.focus()
    expect(standIn.isConnected).toBe(false)
  })

  it("leaves focus alone with a mouse", () => {
    pointer(false)
    raiseKeyboard()
    expect(document.activeElement).toBe(document.body)
    expect(document.querySelector("input")).toBeNull()
  })
})
