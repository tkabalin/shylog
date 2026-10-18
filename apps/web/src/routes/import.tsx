import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/import")({
  component: ImportPage,
})

function ImportPage() {
  return <h1 className="sr-only">Import</h1>
}
