import { useSyncExternalStore } from "react"

// Whether the browser has a network at all. Kept apart from the sync
// state, so Explore reads it without loading the log (the public site has
// none).
function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener)
  window.addEventListener("offline", listener)
  return () => {
    window.removeEventListener("online", listener)
    window.removeEventListener("offline", listener)
  }
}

export const useOnline = () =>
  useSyncExternalStore(subscribeOnline, () => navigator.onLine)
