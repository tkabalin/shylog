import { useSyncExternalStore } from "react"

import { localValue } from "@/lib/local-value"

// Whether the profile's temperature lane draws the water as it was or every
// reading as recorded. Kept per phone, as Appearance is, and on
// unless turned off; one store, so You's switch redraws an open chart.
const smooth = localValue(
  "smooth-temperature",
  (stored) => stored !== "off",
  (on) => (on ? "on" : "off")
)

export const setSmoothTemperature = smooth.set

export const subscribeSmoothTemperature = smooth.subscribe

export const readSmoothTemperature = smooth.get

export const useSmoothTemperature = () =>
  useSyncExternalStore(smooth.subscribe, smooth.get)
