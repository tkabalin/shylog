import { useEffect, useReducer, type ComponentType } from "react"

// A component whose code loads on demand, drawn on its first render once
// loaded. React.lazy suspends that render even when the import has finished,
// and React holds the empty fallback for 300 ms, so a sheet's first open lagged.
export function preloadable<P extends object>(
  load: () => Promise<ComponentType<P>>
) {
  let loaded: ComponentType<P> | undefined
  let loading: Promise<ComponentType<P>> | undefined
  const preload = () =>
    (loading ??= load().then(
      (component) => (loaded = component),
      // Offline before the chunk was cached: the next open tries again.
      (error: unknown) => {
        loading = undefined
        throw error
      }
    ))

  function Preloaded(props: P) {
    const [, settle] = useReducer((n: number) => n + 1, 0)
    useEffect(() => {
      if (!loaded) preload().then(settle, () => {})
    }, [])
    const Loaded = loaded
    return Loaded ? <Loaded {...props} /> : null
  }
  return { Component: Preloaded, preload }
}
