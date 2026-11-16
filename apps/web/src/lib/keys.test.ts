import type { KeyboardEvent } from "react"
import { describe, expect, it } from "vitest"

import { isReturn } from "./keys"

const key = (init: Partial<KeyboardEvent> & { isComposing?: boolean }) =>
  ({
    key: "Enter",
    keyCode: 13,
    ...init,
    nativeEvent: { isComposing: init.isComposing ?? false },
  }) as unknown as KeyboardEvent

describe("isReturn", () => {
  it("takes Return, and no other key", () => {
    expect(isReturn(key({}))).toBe(true)
    expect(isReturn(key({ key: "a", keyCode: 65 }))).toBe(false)
  })

  it("leaves a Return that confirms a composing keyboard's word", () => {
    expect(isReturn(key({ isComposing: true }))).toBe(false)
    // Safari, which has ended the composition by then.
    expect(isReturn(key({ keyCode: 229 }))).toBe(false)
  })
})
