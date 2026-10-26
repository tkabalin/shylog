import { useEffect } from "react"

import { LoadFailed, outcome, settled } from "@/data/samples"

type ChartModule = typeof import("./profile")

// The chart is its own chunk, so the Log's first render never waits on
// Recharts. It loads once the Log is idle, so a dive's first opening needn't
// wait either. A failed import is a load failure like the samples', offline
// or after a deploy, and stays failed until retried.
let chart: Promise<ChartModule> | undefined
export function loadChart() {
  chart ??= settled(
    import("./profile").catch((cause: unknown) => {
      throw new LoadFailed("Couldn't load the chart", { cause })
    })
  )
  return chart
}

export function retryChart() {
  if (chart && outcome(chart).status === "rejected") chart = undefined
}

export function usePreloadChart() {
  useEffect(() => {
    const load = () => void loadChart().catch(() => {})
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(load)
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(load, 1000)
    return () => clearTimeout(id)
  }, [])
}
