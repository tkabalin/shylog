import { useSyncExternalStore } from "react"

import { countText, diveCount } from "@/components/pickers/match"
import { ago as agoText } from "@/format/dates"

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

// How long ago the oldest waiting dive was saved, in days once it's a day.
function waited(at: string, now: Date) {
  const days = Math.floor((now.getTime() - new Date(at).getTime()) / 86_400_000)
  if (days < 1) return agoText(at, now)
  return days === 1 ? "yesterday" : `${days} days ago`
}

export type SyncCardLook =
  | "synced"
  | "first"
  | "syncing"
  | "waiting"
  | "offline"
  | "unreachable"
  | "stuck"
  | "refused"
  | "paused"

// You's sync card (SettingsHifi): the state in words, and while dives
// wait, how many and how long the oldest has waited, which is the spec's
// banner of unsynced dives. Warn marks what the diver has to act on, as on
// the badge.
export function syncCard(
  { state, unsynced, waiting: queued, oldest, sending }: SyncStatus,
  {
    syncedAt,
    place,
    now = new Date(),
  }: {
    syncedAt: string | undefined
    // The dive's site and day, for the one being uploaded.
    place: (dive: Dive) => string
    now?: Date
  }
): {
  look: SyncCardLook
  title: string
  sub: string
  warn: boolean
  retry: boolean
} {
  const last = syncedAt ? `Last sync ${agoText(syncedAt, now)}` : "No sync yet"
  const waiting = queued.length
  // When it was saved here, not the dive's own date.
  const oldestLine = !oldest
    ? ""
    : waiting === 1
      ? `Saved on this phone ${waited(oldest, now)}`
      : `The oldest was saved ${waited(oldest, now)}`
  const it = waiting === 1 ? "it" : "them"
  if (state === "paused")
    return {
      look: "paused",
      title: "Syncing paused",
      // As the reload offer on every tab says, with the count the badge
      // shows.
      sub: `Reload Shylog to update${waiting ? ` · ${diveCount(waiting)} waiting` : ""}`,
      warn: true,
      retry: false,
    }
  if (state === "syncing")
    return {
      look: "syncing",
      title: `Syncing ${diveCount(Math.max(waiting, 1))}`,
      sub: sending ? `Uploading ${place(sending)}` : oldestLine,
      warn: false,
      retry: false,
    }
  if ((state === "offline" || state === "unreachable") && waiting)
    return {
      look: "waiting",
      title: `${diveCount(waiting)} waiting to upload`,
      sub:
        state === "offline"
          ? `${oldestLine} · ${waiting === 1 ? "it uploads" : "they upload"} when you’re back online`
          : `${oldestLine} · can’t reach the server`,
      warn: state === "unreachable",
      retry: state === "unreachable",
    }
  // Refused dives are counted too, as the badge counts them under Not synced.
  const refused = unsynced.length - waiting
  // The title names the failure, as the offline card's title is the same
  // count waiting; the line says nothing is lost.
  if (state === "stuck")
    return {
      look: "stuck",
      title: `Couldn’t upload ${diveCount(waiting)}`,
      sub: `The server couldn’t save ${it}. ${waiting === 1 ? "It’s" : "They’re"} safe on this phone.${refused ? ` ${countText(refused)} more ${refused === 1 ? "was" : "were"} refused.` : ""}`,
      warn: true,
      retry: true,
    }
  if (state === "offline")
    return {
      look: "offline",
      title: "Offline",
      sub: `${last} · new dives save on this phone`,
      warn: false,
      retry: false,
    }
  if (state === "unreachable")
    return {
      look: "unreachable",
      title: "Can’t reach the server",
      sub: `Is Tailscale on? ${last}`,
      warn: true,
      retry: true,
    }
  if (state === "refused")
    return {
      look: "refused",
      title: `${diveCount(unsynced.length)} not synced`,
      sub:
        unsynced.length === 1
          ? "The server refused it. Open it to see why"
          : "The server refused them. Open each to see why",
      warn: true,
      retry: false,
    }
  return syncedAt
    ? {
        look: "synced",
        title: "All synced",
        sub: last,
        warn: false,
        retry: false,
      }
    : {
        look: "first",
        title: "Syncing",
        sub: "Fetching your log",
        warn: false,
        retry: false,
      }
}
