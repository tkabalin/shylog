// iOS raises the keyboard only for a focus inside the tap itself, and a
// sheet focuses its field a moment later, once it has opened. A stand-in
// focused during the tap brings the keyboard up, and iOS keeps it up as
// focus moves on to the sheet's field.
export function raiseKeyboard() {
  // A mouse or keyboard user has no keyboard to raise, and keeps focus
  // returning to the row that opened the sheet.
  if (!matchMedia("(pointer: coarse)").matches) return
  const input = document.createElement("input")
  input.ariaHidden = "true"
  input.tabIndex = -1
  // As the sheet's field, so the keyboard doesn't change as focus moves.
  input.autocapitalize = "words"
  // 16px, or iOS zooms in on it.
  Object.assign(input.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "1px",
    height: "1px",
    opacity: "0",
    fontSize: "16px",
    pointerEvents: "none",
  })
  input.addEventListener("blur", () => input.remove(), { once: true })
  document.body.append(input)
  input.focus({ preventScroll: true })
}
