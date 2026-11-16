import type { KeyboardEvent } from "react"

// Return as a key that acts, not one confirming a word a composing keyboard
// (Japanese, Chinese, Korean) is still building; Safari ends composition
// before that keydown, so only keyCode 229 tells it apart there.
export const isReturn = (event: KeyboardEvent) =>
  event.key === "Enter" &&
  !event.nativeEvent.isComposing &&
  event.keyCode !== 229
