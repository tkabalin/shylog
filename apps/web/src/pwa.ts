import { registerSW } from "virtual:pwa-register"

// The service worker (see vite.config.ts). A new version waits until every
// window has closed, or until reloadApp() asks for it.
let update: ((reload?: boolean) => Promise<void>) | undefined
let registration: ServiceWorkerRegistration | undefined
let waiting = false
let wanted = false

export function startWorker() {
  update = registerSW({
    immediate: true,
    onNeedRefresh() {
      waiting = true
      if (wanted) void update?.(true)
    },
    // Without it every open window reloads once a new version takes over,
    // an open form included. Only the one that asked does; the others keep
    // the code they loaded until the next launch.
    onNeedReload() {
      if (wanted) location.reload()
    },
    onRegisteredSW(_, found) {
      registration = found
      // Checked on each return to the foreground too, so a deploy is
      // downloaded in time for the next launch rather than the one after.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible")
          found?.update().catch(() => {})
      })
    },
  })
}

// Loads the newest version, for a server on a newer schema: a plain reload
// would get the cached app again. A version still downloading takes over
// once it is installed, however slow the link; with no worker (dev), or
// none coming, it just reloads.
export function reloadApp() {
  wanted = true
  if (waiting && update) return void update(true)
  const found = registration
  if (!found) return location.reload()
  void found
    .update()
    .catch(() => {})
    .then(() => {
      // One already installed is handed over by onNeedRefresh.
      if (found.waiting) return
      const installing = found.installing
      if (!installing) return location.reload()
      installing.addEventListener("statechange", () => {
        if (installing.state === "redundant") location.reload()
      })
    })
}
