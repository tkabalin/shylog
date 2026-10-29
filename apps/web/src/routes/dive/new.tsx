import { useState } from "react"
import { newId, type DiveId } from "@shylog/core"
import { createFileRoute, Navigate, useRouter } from "@tanstack/react-router"

import { useLog, type LogView } from "@/data/log"
import { useAutosave } from "@/dive/form/autosave"
import { DiveForm } from "@/dive/form/dive-form"
import { saveNewDive } from "@/dive/form/save"
import { newDiveValues, type FormValues } from "@/dive/form/values"

export const Route = createFileRoute("/dive/new")({
  component: NewDivePage,
})

// The form's values with the new dive's id, kept together, so a form iOS
// killed after the draft was saved reopens on that dive, not a second one.
interface Kept {
  values: FormValues
  diveId: DiveId
}

function NewDivePage() {
  const { log, loaded, failed } = useLog()
  const autosave = useAutosave<Kept>("new")
  // No log on the phone and the first sync failed: the form hides the tab
  // bar, so the Log, which says why, takes its place rather than a blank
  // screen. While that sync is still going, it waits.
  if (loaded && !log && failed) return <Navigate to="/" replace />
  if (!log || autosave.restored === undefined) return null
  return <NewDive log={log} autosave={autosave} />
}

function NewDive({
  log,
  autosave,
}: {
  log: LogView
  autosave: ReturnType<typeof useAutosave<Kept>>
}) {
  const router = useRouter()
  const navigate = Route.useNavigate()
  // One id for the visit, so Try again saves the same dive.
  const [diveId] = useState(() => autosave.restored?.diveId ?? newId("dive"))

  const [blank] = useState(() => newDiveValues(log.settings))

  // Back to the Log the form was opened from, or a fresh Log in its place.
  const close = () => {
    if (router.history.canGoBack()) router.history.back()
    else void navigate({ to: "/", replace: true })
  }

  return (
    <DiveForm
      title="New dive"
      log={log}
      initial={autosave.restored?.values ?? blank}
      blank={blank}
      onChange={(values) => autosave.write({ values, diveId })}
      onSave={async (values) => {
        await saveNewDive(diveId, values)
        await autosave.clear()
        // The dive's detail takes the form's place, so the form can never
        // be reopened by Back and saved twice.
        await navigate({
          to: "/dive/$diveId",
          params: { diveId },
          replace: true,
          // The Log behind the form is behind the dive now, so its Log
          // link goes back to it rather than stacking a second Log. Saved
          // has the dive's page celebrate it (see dive/celebration.ts).
          state: { fromLog: router.state.location.state.fromLog, saved: true },
        })
      }}
      onCancel={close}
      onDiscard={() => void autosave.clear()}
    />
  )
}
