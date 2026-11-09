import { useSyncExternalStore } from "react"

// Whether the browser has promised to keep Shylog's data: the drafts, and
// the log mirror and profiles that make a dive open at once and offline
// (see Offline safety in the spec). Unknown until first read.
export type Protection = "protected" | "unprotected" | "unknown"

let protection: Protection = "unknown"
const listeners = new Set<() => void>()

function set(next: Protection) {
  protection = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export const useProtection = () =>
  useSyncExternalStore(subscribe, () => protection)

// A browser without the API (an old one) can't be asked, so it counts as
// unprotected, which the help sheet is for.
export async function readProtection(storage = navigator.storage) {
  set(
    storage?.persisted && (await storage.persisted().catch(() => false))
      ? "protected"
      : "unprotected"
  )
}

// Asks the browser to keep the data. Chrome decides on its own, Firefox
// asks the diver, and WebKit grants it mainly to an app on the Home Screen.
export async function protect(storage = navigator.storage) {
  if (storage?.persist) await storage.persist().catch(() => false)
  await readProtection(storage)
}

// Whether the app runs from the Home Screen rather than a browser tab.
const installed = () =>
  matchMedia("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true

// Asked once on the first launch, as Firefox shows a prompt each time, and
// once more on the first launch installed: an app added from Chrome shares
// the tab's storage, and Chrome grants it to an installed app more readily.
// After that only the You tab's Keep them safe asks again.
export async function protectOnFirstLaunch(
  storage = navigator.storage,
  local?: Pick<Storage, "getItem" | "setItem">,
  standalone = installed()
) {
  const asked = standalone ? "storage-asked-installed" : "storage-asked"
  let first = true
  try {
    // Read inside the try: a browser blocking storage throws on access.
    const store = local ?? globalThis.localStorage
    first = store.getItem(asked) == null
    store.setItem(asked, "1")
  } catch {
    // Blocked storage: asking each launch is the safe side.
  }
  if (first) await protect(storage)
  else await readProtection(storage)
}
