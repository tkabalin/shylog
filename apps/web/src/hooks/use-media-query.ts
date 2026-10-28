import * as React from "react"

// One MediaQueryList per query, as React reads the snapshot on every
// render of every subscriber, and matchMedia parses the query each call.
const lists = new Map<string, MediaQueryList>()
function list(query: string) {
  let mql = lists.get(query)
  if (!mql) {
    mql = window.matchMedia(query)
    lists.set(query, mql)
  }
  return mql
}

export function useMediaQuery(query: string) {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mql = list(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    [query]
  )
  return React.useSyncExternalStore(
    subscribe,
    () => list(query).matches,
    () => false
  )
}
