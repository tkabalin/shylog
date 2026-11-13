import { createFileRoute } from "@tanstack/react-router"

import { StatsScreen } from "@/stats/stats-screen"

// The year is in the URL, so Back from a record's dive keeps it; with
// none the screen shows all time.
interface StatsSearch {
  year?: number
}

export const Route = createFileRoute("/stats")({
  validateSearch: (search: Record<string, unknown>): StatsSearch => ({
    // A number, so the URL reads ?year=2026 as the Log's does.
    year: Number.isInteger(search.year) ? (search.year as number) : undefined,
  }),
  component: StatsPage,
})

function StatsPage() {
  const { year } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <StatsScreen
      year={year?.toString()}
      // A filter, so it replaces the entry rather than adding one.
      onYear={(next) =>
        void navigate({
          search: { year: next ? Number(next) : undefined },
          replace: true,
          // The chip is at the top, and resetting forces a layout.
          resetScroll: false,
        })
      }
    />
  )
}
