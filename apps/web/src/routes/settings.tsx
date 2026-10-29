import { createFileRoute, redirect } from "@tanstack/react-router"

// The tab was Settings before it became You (D30): an installed copy or a
// bookmark that still opens /settings lands there.
export const Route = createFileRoute("/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/you", replace: true })
  },
})
