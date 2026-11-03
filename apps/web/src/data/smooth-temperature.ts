import { useSyncExternalStore } from "react"

// Whether the profile's temperature lane draws the water as it was or every
// reading as recorded (D35). Kept per phone, as Appearance is, and on
// unless turned off; one store, so You's switch redraws an open chart.
const key = "smooth-temperature"

// Some privacy settings make localStorage throw; the app must still load.
function read() {
  try {
    return localStorage.getItem(key) !== "off"
  } catch {
    return true
  }
}

let on = read()
const listeners = new Set<() => void>()

export function setSmoothTemperature(next: boolean) {
  on = next
  try {
    localStorage.setItem(key, next ? "on" : "off")
  } catch {
    // Kept for this visit only.
  }
  for (const listener of listeners) listener()
}

// Another window of the app changed it.
window.addEventListener("storage", (event) => {
  if (event.storageArea !== localStorage || event.key !== key) return
  on = event.newValue !== "off"
  for (const listener of listeners) listener()
})

export function subscribeSmoothTemperature(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export const readSmoothTemperature = () => on

export const useSmoothTemperature = () =>
  useSyncExternalStore(subscribeSmoothTemperature, readSmoothTemperature)
