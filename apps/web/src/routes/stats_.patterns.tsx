import { createFileRoute } from "@tanstack/react-router"

import { AllPatterns } from "@/stats/patterns/all-patterns"

// The year Statistics showed, so the list follows it and Back keeps it.
interface PatternsSearch {
  year?: number
}

export const Route = createFileRoute("/stats_/patterns")({
  validateSearch: (search: Record<string, unknown>): PatternsSearch => ({
    year: Number.isInteger(search.year) ? (search.year as number) : undefined,
  }),
  component: PatternsPage,
})

function PatternsPage() {
  const { year } = Route.useSearch()
  return <AllPatterns year={year?.toString()} />
}
