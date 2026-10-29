import { useState } from "react"
import { IconChevronLeft } from "@tabler/icons-react"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"

import type { Dive } from "@/data/db"
import { leaveAfterDelete } from "@/dive/delete-sheet"
import { useLog, type LogView } from "@/data/log"
import { useAutosave } from "@/dive/form/autosave"
import { DiveForm } from "@/dive/form/dive-form"
import { saveDraftEdit, saveSyncedEdit } from "@/dive/form/save"
import { fromDive, type FormValues } from "@/dive/form/values"

// Edit is pushed from the dive's detail, and its own screen rather than a
// child of it, so the form gets the whole screen.
export const Route = createFileRoute("/dive/$diveId_/edit")({
  component: EditDivePage,
})

// The form's values with the saved values they were typed over, so an edit
// sends only what was typed, not a sync's changes undone.
interface Kept {
  values: FormValues
  original: FormValues
}

function EditDivePage() {
  const { diveId } = Route.useParams()
  const { log, loaded } = useLog()
  const autosave = useAutosave<Kept>(diveId)
  const dive = log?.dive.get(diveId)
  // Nothing until the first sync has filled the log, as on the detail.
  if (!loaded || !log || autosave.restored === undefined) return null
  if (!dive || dive.deletedAt) {
    return (
      <div className="flex flex-col gap-2 p-4 pt-[calc(1rem+env(safe-area-inset-top))] md:mx-auto md:w-full md:max-w-3xl">
        {/* The form hides the tab bar, so this is the way out. */}
        <Link
          to="/"
          replace
          className="inline-flex h-11 items-center gap-0.5 self-start pr-2 pl-1 text-base font-medium text-primary"
        >
          <IconChevronLeft aria-hidden className="size-5.5 stroke-[2.25]" />
          Log
        </Link>
        <h1 className="text-xl font-semibold">Dive not found</h1>
        <p className="text-muted-foreground">
          It may have been deleted, or the log on this device is out of date.
        </p>
      </div>
    )
  }
  return (
    <EditDive
      key={diveId}
      diveId={diveId}
      dive={dive}
      log={log}
      autosave={autosave}
    />
  )
}

function EditDive({
  diveId,
  dive,
  log,
  autosave,
}: {
  diveId: string
  dive: Dive
  log: LogView
  autosave: ReturnType<typeof useAutosave<Kept>>
}) {
  const router = useRouter()
  const navigate = Route.useNavigate()
  const restored = autosave.restored
  // Taken once: a sync while the form is open changes the dive, but not
  // what the diver typed over.
  const [original] = useState(() => restored?.original ?? fromDive(dive, log))

  // Save and Cancel go back to the detail behind the form, or replace the
  // form with it when the form was opened on its own.
  const close = () => {
    if (router.history.canGoBack()) router.history.back()
    else
      void navigate({ to: "/dive/$diveId", params: { diveId }, replace: true })
  }

  return (
    <DiveForm
      title="Edit dive"
      log={log}
      dive={dive}
      original={original}
      initial={restored?.values ?? original}
      onChange={(values) => autosave.write({ values, original })}
      onSave={async (values) => {
        if (dive.draft) await saveDraftEdit(diveId, original, values)
        else await saveSyncedEdit(diveId, original, values)
        await autosave.clear()
        close()
      }}
      onCancel={close}
      onDiscard={() => void autosave.clear()}
      // Back to the detail, which then leaves for whatever opened it.
      onDeleted={() => {
        void autosave.clear()
        leaveAfterDelete(diveId)
        close()
      }}
    />
  )
}
