import { useEffect, useMemo, useState } from "react"

import { clearForm, formSaver, readForm } from "@/data/autosave"

// The form's unsaved values, kept on the phone as they are typed, since iOS
// often kills a backgrounded home-screen app mid-entry. Reopening the form
// picks up where it was; saving or discarding clears them.
export function useAutosave<T>(key: string) {
  const saver = useMemo(() => formSaver<T>(key), [key])
  const [restored, setRestored] = useState<{
    key: string
    values: T | null
  } | null>(null)
  useEffect(() => {
    let live = true
    readForm<T>(key)
      .then((values) => live && setRestored({ key, values: values ?? null }))
      // Storage refused: the form opens fresh rather than not at all.
      .catch(() => live && setRestored({ key, values: null }))
    return () => {
      live = false
      // Leaving mid-edit keeps the last keystrokes.
      void saver.flush()
    }
  }, [key, saver])
  return {
    // Undefined until the stored values have been read.
    restored: restored?.key === key ? restored.values : undefined,
    write: (values: T) => saver.write(values),
    clear: async () => {
      saver.cancel()
      // As with a failed write, only the restore is lost, so a dive that
      // saved doesn't show "Couldn't save" and get saved twice.
      await clearForm(key).catch((error: unknown) =>
        console.warn("Couldn't clear the form's values", error)
      )
    },
  }
}
