import { useEffect, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { useOnForm } from "@/components/app-nav"
import { useQueueCounts } from "@/data/drafts"
import { useLog } from "@/data/log"
import { reloadApp, useUpdateReady } from "@/pwa"

export type UpdateOffer = "paused" | "ready" | undefined

// Which offer to make (see Client data in the spec). A server on a newer
// schema takes nothing until the app updates, so that offer never waits.
// A new version waits for the drafts still to upload, as the code that
// wrote them sends them, but not for refused ones, which it may fix.
export function updateOffer({
  blocked,
  hasLog,
  ready,
  waiting,
  held,
}: {
  blocked: boolean
  hasLog: boolean
  ready: boolean
  waiting: number
  held: boolean
}): UpdateOffer {
  // A reload would drop what the form holds; the offer waits for it to close.
  if (held) return undefined
  // With no log yet, the Log's own screen offers it.
  if (blocked) return hasLog ? "paused" : undefined
  return ready && !waiting ? "ready" : undefined
}

// Forms and sheets holding unsaved edits, which hold the offer back.
let holds = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

function notify() {
  for (const listener of listeners) listener()
}

export function useHoldUpdate(when: boolean) {
  useEffect(() => {
    if (!when) return
    holds += 1
    notify()
    return () => {
      holds -= 1
      notify()
    }
  }, [when])
}

const useHeld = () => useSyncExternalStore(subscribe, () => holds > 0)

// Swiped away, an offer stays away until the next launch, which takes the
// new version anyway; You's sync card still offers a paused one.
let dismissed = false

// The toast on screen, if any. Sonner calls onDismiss for a toast the app
// takes down too, so only one not marked as closing was swiped away.
let shown: { id: string; offer: UpdateOffer; closing: boolean } | undefined
let closeTimer: ReturnType<typeof setTimeout> | undefined
let showings = 0

// A new id each time it comes back, as one reused during Sonner's exit
// took the old toast's removal; the same id while it is up, so ready
// turning to paused changes it in place.
function show(offer: NonNullable<UpdateOffer>) {
  const showing = {
    id: shown?.id ?? `update-${++showings}`,
    offer,
    closing: false,
  }
  shown = showing
  toast("A new version of Shylog is ready", {
    id: showing.id,
    description:
      offer === "paused" ? "Syncing is paused until you reload." : undefined,
    duration: Infinity,
    // Wraps rather than cutting off on a narrow phone, as a one-line
    // toast's name may.
    classNames: {
      title: "!whitespace-normal text-balance",
      description: "text-pretty",
    },
    // Kept up until the page reloads, which can wait for a slow download.
    // Sonner's own take-down would skip onDismiss and leave `shown` stale.
    action: {
      label: "Reload",
      onClick: (event) => {
        event.preventDefault()
        reloadApp()
      },
    },
    onDismiss: () => {
      if (!showing.closing) dismissed = true
      if (shown?.id === showing.id) shown = undefined
    },
  })
}

function close() {
  if (!shown) return
  shown.closing = true
  toast.dismiss(shown.id)
  shown = undefined
}

// The offer, as a toast on every tab until it's taken or swiped away.
export function UpdateToast() {
  const { log, blocked } = useLog()
  const queued = useQueueCounts()
  const ready = useUpdateReady()
  const holding = useHeld()
  const onForm = useOnForm()
  const offer = updateOffer({
    blocked,
    hasLog: !!log,
    ready,
    // From the queue, which every tab's saves and uploads reach at once,
    // where a tab's log waits for its next sync. Unknown counts as waiting.
    waiting: queued?.waiting ?? 1,
    held: holding || onForm,
  })
  useEffect(() => {
    if (!offer || dismissed) return
    // A take-down asked for in this same commit (React's double effect in
    // development, or ready turning to paused) is called off, so the toast
    // stays, or changes in place.
    clearTimeout(closeTimer)
    if (shown?.offer !== offer) show(offer)
    return () => {
      closeTimer = setTimeout(close)
    }
  }, [offer])
  return null
}
