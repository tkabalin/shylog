import { useEffect, useState } from "react"

// What a JSON file or two the service worker keeps with the app make,
// out of the map's chunk, loaded once as the map's code runs so it's in
// hand when a sheet opens. A failed load (a first visit with no signal) is
// tried again on the next ask, or as soon as the signal is back.
export function loadOnce<T>(make: () => Promise<T>) {
  let value: T | undefined
  let loading: Promise<T> | undefined
  const load = () =>
    (loading ??= make()
      .then((made) => (value = made))
      .catch((error: unknown) => {
        loading = undefined
        throw error
      }))
  void load().catch(() => {})
  return { load, get: () => value }
}

export const fetchJson = <T>(url: string) =>
  fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${url}: ${response.status}`)
    return response.json() as Promise<T>
  })

// The file once it has come, and whether the last try failed. `again`
// asks once more when it changes, as for the next site.
export function useJsonFile<T>(
  file: { load: () => Promise<T>; get: () => T | undefined },
  again?: unknown
) {
  const [loaded, setLoaded] = useState(file.get)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (loaded) return
    let live = true
    const attempt = () =>
      file.load().then(
        (all) => live && setLoaded(all),
        () => live && setFailed(true)
      )
    void attempt()
    window.addEventListener("online", attempt)
    return () => {
      live = false
      window.removeEventListener("online", attempt)
    }
  }, [file, loaded, again])
  return { loaded, failed }
}
