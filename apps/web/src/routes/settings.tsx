import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
})

function SettingsPage() {
  return <h1 className="sr-only">Settings</h1>
}
