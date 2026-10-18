import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: LogPage,
})

function LogPage() {
  return <h1 className="sr-only">Log</h1>
}
