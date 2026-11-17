import { useCallback, useEffect, useRef } from "react"

// What a phone form held when the diver left it unsaved, by a swipe back or
// a tab, given back silently when the same form opens again. Kept for the
// tab's session, so a reload (the update toast's) keeps it too.
const prefix = "shylog-kept:"

// `fits` says whether what was kept still applies, such as an edit whose
// record hasn't changed since; anything else, or text this app can't read
// (an older version's), is dropped.
export function readKept<T>(key: string, fits: (kept: T) => boolean) {
  try {
    const text = sessionStorage.getItem(prefix + key)
    if (text == null) return null
    const kept = JSON.parse(text) as T
    if (fits(kept)) return kept
  } catch {
    // Storage turned off or unreadable: the form opens fresh.
  }
  dropKept(key)
  return null
}

export function dropKept(key: string) {
  try {
    sessionStorage.removeItem(prefix + key)
  } catch {
    // Nothing was kept.
  }
}

// Keeps `value` each time it is a new one (memoise it), and nothing while
// it is null. The returned function ends the keeping for the form's life,
// for Save, Cancel and delete, so a last render can't write it back.
export function useKeptForm<T>(key: string, value: T | null) {
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    try {
      if (value == null) sessionStorage.removeItem(prefix + key)
      else sessionStorage.setItem(prefix + key, JSON.stringify(value))
    } catch {
      // Storage full or off: only the restore is lost.
    }
  }, [key, value])
  return useCallback(() => {
    done.current = true
    dropKept(key)
  }, [key])
}
