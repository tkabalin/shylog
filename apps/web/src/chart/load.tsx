import { useEffect, useReducer, useState } from "react"

import type { Dive } from "@/data/db"
import {
  LoadFailed,
  loadProfile,
  outcome,
  retryProfile,
  settled,
} from "@/data/samples"

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

// Re-renders when a load settles and reads its outcome, so the chart never
// suspends: React holds a Suspense fallback for at least 300 ms, even for a
// profile read from the phone in a few milliseconds.
function useSettled<T>(promise: Promise<T>) {
  const [, settle] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    let live = true
    const done = () => live && settle()
    promise.then(done, done)
    return () => {
      live = false
    }
  }, [promise])
  return outcome(promise)
}

// A dive's samples and the chart's code, as they settle, and a retry for
// either failing (Try again).
export function useChartLoads(dive: Dive) {
  const [loads, setLoads] = useState(() => ({
    profile: loadProfile(dive),
    chart: loadChart(),
  }))
  return {
    profile: useSettled(loads.profile),
    chart: useSettled(loads.chart),
    retry() {
      retryProfile(dive)
      retryChart()
      setLoads({ profile: loadProfile(dive), chart: loadChart() })
    },
  }
}

// True once `ms` have passed since the first render: a load quicker than
// that shows no skeleton.
export function useAfter(ms: number) {
  const [after, setAfter] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setAfter(true), ms)
    return () => clearTimeout(id)
  }, [ms])
  return after
}
