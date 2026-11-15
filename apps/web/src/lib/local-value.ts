// A value kept in this device's localStorage: read once at launch, shared
// by every screen that shows it, and kept in step with the app's other
// windows. `parse` turns the stored text (null when there is none) into the
// value, and may throw on text it can't read, which counts as none.
export function localValue<T>(
  key: string,
  parse: (stored: string | null) => T,
  serialise: (value: T) => string
) {
  const from = (stored: string | null) => {
    try {
      return parse(stored)
    } catch {
      return parse(null)
    }
  }
  // Some privacy settings make localStorage throw; the app must still load.
  const read = () => {
    try {
      return from(localStorage.getItem(key))
    } catch {
      return parse(null)
    }
  }
  let value = read()
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of listeners) listener()
  }
  window.addEventListener("storage", (event) => {
    if (event.storageArea !== localStorage || event.key !== key) return
    value = from(event.newValue)
    notify()
  })
  return {
    get: () => value,
    set(next: T) {
      value = next
      try {
        localStorage.setItem(key, serialise(next))
      } catch {
        // Kept for this visit only.
      }
      notify()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}
