import { lazy, type ComponentProps } from "react"

import { LoadFailed } from "@/data/samples"

// The chart is its own chunk, so the Log never loads Recharts. A failed
// import is a load failure like the samples', offline or after a deploy.
let failed = false
export const loadChart = () =>
  import("./profile").catch((cause: unknown) => {
    failed = true
    throw new LoadFailed("Couldn't load the chart", { cause })
  })
let Lazy = lazy(loadChart)

// React.lazy keeps a failed import for good, so a retry needs a new one.
export function retryChart() {
  if (!failed) return
  failed = false
  Lazy = lazy(loadChart)
}

// The Profile card's body, from the chunk (see profile.tsx).
export function ProfileChart(props: ComponentProps<typeof Lazy>) {
  const Current = Lazy
  return <Current {...props} />
}
