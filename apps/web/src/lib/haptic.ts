// A light tick for a tap, as iOS gives its own segmented controls. Android
// has the Vibration API; Safari has none, so iOS falls back to the hack below.
export function haptic() {
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(10)
    return
  }
  if (!("switch" in HTMLInputElement.prototype)) return
  // HACK: Safari plays the system haptic when a native switch toggles, even a
  // hidden one clicked from script, as long as it runs inside a real tap.
  // Apple never documented this and may stop it; then the tick just goes.
  const label = document.createElement("label")
  label.ariaHidden = "true"
  label.style.display = "none"
  const input = document.createElement("input")
  input.type = "checkbox"
  input.setAttribute("switch", "")
  label.append(input)
  // In <head>, away from the form, so the toggle can't touch its state.
  document.head.append(label)
  label.click()
  label.remove()
}
