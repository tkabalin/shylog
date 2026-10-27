import { queue as defaultQueue, type QueueDb } from "./drafts"

// The dive form's unsaved values, so a form iOS killed in the background
// reopens as it was. One per dive being edited, under its id, and one for
// a new dive under "new". Not a draft: it never uploads and has no ops.
export async function writeForm<T>(
  key: string,
  values: T,
  db: QueueDb = defaultQueue
) {
  await db.forms.put({ key, values })
}

export async function readForm<T>(key: string, db: QueueDb = defaultQueue) {
  return (await db.forms.get(key))?.values as T | undefined
}

// On save or discard.
export const clearForm = (key: string, db: QueueDb = defaultQueue) =>
  db.forms.delete(key)

// Writes the latest values once typing pauses. Flush on leaving the page,
// and cancel before clearing, so a pending write can't bring them back.
export function formSaver<T>(
  key: string,
  { db = defaultQueue, delay = 400 }: { db?: QueueDb; delay?: number } = {}
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: { values: T } | undefined
  let writing = Promise.resolve()

  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
    pending = undefined
  }
  const flush = () => {
    const next = pending
    cancel()
    if (next) {
      // A failed write (storage full) loses only the restore, so the form
      // carries on.
      writing = writeForm(key, next.values, db).catch((error: unknown) =>
        console.warn("Couldn't keep the form's values", error)
      )
    }
    return writing
  }
  return {
    write(values: T) {
      pending = { values }
      clearTimeout(timer)
      timer = setTimeout(() => void flush(), delay)
    },
    flush,
    cancel,
  }
}
