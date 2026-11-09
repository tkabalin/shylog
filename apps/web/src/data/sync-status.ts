import { useSyncExternalStore } from "react"

import type { Dive } from "./db"
import { useLog, type LogView } from "./log"
import { useSending, useServerError } from "./upload"

// The sync states (see Offline safety in the spec). Paused is a server on
// a newer schema than this app, which takes nothing until it updates;
// stuck, one that answered an upload with an error.
export type SyncState =
  | "synced"
  | "syncing"
  | "offline"
  | "unreachable"
  | "stuck"
  | "refused"
  | "paused"

export interface SyncStatus {
  state: SyncState
  // Dives only on this phone, refused ones included.
  unsynced: Dive[]
  // Those still to upload.
  waiting: Dive[]
  // When the oldest still waiting to upload was saved.
  oldest: string | undefined
  // The draft being uploaded, if any.
  sending: Dive | undefined
}

export function syncStatus({
  online,
  failed,
  blocked,
  sending,
  serverError = false,
  log,
}: {
  online: boolean
  failed: boolean
  blocked: boolean
  sending: string | undefined
  serverError?: boolean
  log: LogView | null
}): SyncStatus {
  const unsynced = log?.dives.filter((dive) => dive.draft) ?? []
  const waiting = unsynced.filter((dive) => !dive.rejected)
  const state: SyncState = !online
    ? "offline"
    : blocked
      ? "paused"
      : failed
        ? "unreachable"
        : sending
          ? "syncing"
          : waiting.length
            ? serverError
              ? "stuck"
              : "syncing"
            : unsynced.length
              ? "refused"
              : "synced"
  return {
    state,
    unsynced,
    waiting,
    oldest: waiting
      .map((dive) => dive.savedAt)
      .filter((at) => at != null)
      .sort()[0],
    sending: sending ? log?.dive.get(sending) : undefined,
  }
}

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener)
  window.addEventListener("offline", listener)
  return () => {
    window.removeEventListener("online", listener)
    window.removeEventListener("offline", listener)
  }
}

export const useOnline = () =>
  useSyncExternalStore(subscribeOnline, () => navigator.onLine)

export function useSyncStatus() {
  const { log, failed, blocked } = useLog()
  const online = useOnline()
  const sending = useSending()
  const serverError = useServerError()
  return syncStatus({ online, failed, blocked, sending, serverError, log })
}

// Whether a change to synced data can reach the server now. Unreachable
// counts as offline, as SettingsHifi treats it.
export function useConnected() {
  const { failed } = useLog()
  return useOnline() && !failed
}

