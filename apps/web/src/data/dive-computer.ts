import { useSyncExternalStore } from "react"
import type { ImportPreview } from "@shylog/core"

import { apiClient } from "@/api/client"

import { unreachable } from "./edits"
import { reasonIn, send } from "./upload"

// The watch on the home server's cable (see Downloading from the dive
// computer in the spec): whether this instance downloads at all, the watch
// it remembers, and what Detect found.

export interface Remembered {
  model: string
  lastDownloadAt: string | null
}

export interface Detected {
  model: string
  // This log's own watch, and when it was last downloaded.
  known: boolean
  // A watch other than the one this log downloads from.
  other: boolean
  lastDownloadAt: string | null
}

// Why a detect or download failed, as the server says, so the screen can
// show each its own way.
export type Failure =
  | "noCable"
  | "noWatch"
  | "stopped"
  | "failed"
  | "busy"
  | "unsupported"
  | "other"
  | "unreachable"

export class ComputerError extends Error {
  readonly reason: Failure

  constructor(reason: Failure, message: string) {
    super(message)
    this.reason = reason
  }
}

interface State {
  enabled: boolean
  computer: Remembered | null
}

// The last answer is kept on the phone, so Import lays out its card from
// the first frame, rather than moving Choose file when it arrives, and
// shows it greyed with no signal.
const storageKey = "shylog-dive-computer"

function stored(): State {
  try {
    const found = JSON.parse(
      localStorage.getItem(storageKey) ?? "null"
    ) as State | null
    if (found) return found
  } catch {
    // Storage turned off: the card waits for the server.
  }
  return { enabled: false, computer: null }
}

let state: State = stored()
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  try {
    localStorage.setItem(storageKey, JSON.stringify(next))
  } catch {
    // As above.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export const useDiveComputer = () =>
  useSyncExternalStore(subscribe, () => state)

async function failure(res: Response | undefined) {
  if (!res) return new ComputerError("unreachable", unreachable)
  const body = (await res.json().catch(() => undefined)) as
    { reason?: Failure } | undefined
  // A refusal with no reason of its own is another watch.
  const reason = body?.reason ?? (res.status === 409 ? "other" : "failed")
  return new ComputerError(
    reason,
    reasonIn(body) ?? `Something went wrong (${res.status})`
  )
}

// `GET /api/dive-computer`, at launch and on opening Import or You.
export async function loadDiveComputer(fetch?: typeof globalThis.fetch) {
  const res = await send(() => apiClient(fetch).api["dive-computer"].$get())
  if (!res?.ok) return
  set((await res.json()) as State)
}

// `POST /api/dive-computer/detect`: opens the watch for its model.
export async function detectComputer(fetch?: typeof globalThis.fetch) {
  const res = await send(() =>
    apiClient(fetch).api["dive-computer"].detect.$post()
  )
  if (!res?.ok) throw await failure(res)
  return (await res.json()) as Detected
}

// `GET /api/dive-computer/progress`: how much of the watch the running
// download has read, 0 to 1, or null before and after the read itself.
export async function computerProgress(fetch?: typeof globalThis.fetch) {
  const res = await send(() =>
    apiClient(fetch).api["dive-computer"].progress.$get()
  )
  if (!res?.ok) return null
  return ((await res.json()) as { progress: number | null }).progress
}

// `POST /api/dive-computer/download`: the review's preview, or null when
// the watch has nothing new. The first download remembers the watch.
export async function downloadFromComputer(
  readAll: boolean,
  fetch?: typeof globalThis.fetch
) {
  const res = await send(() =>
    apiClient(fetch).api["dive-computer"].download.$post({ json: { readAll } })
  )
  if (!res?.ok) {
    // The watch may have been remembered before the download broke off.
    if (res) await loadDiveComputer(fetch)
    throw await failure(res)
  }
  const { preview } = (await res.json()) as { preview: ImportPreview | null }
  // Loaded here, as launch loads this module and the review's isn't needed.
  // The preview is stored either way, so a chunk that fails to load leaves
  // the review to fetch it rather than calling the download failed.
  if (preview)
    await import("./import")
      .then(({ startReview }) => startReview(preview))
      .catch(() => {})
  await loadDiveComputer(fetch)
  return preview
}

// `DELETE /api/dive-computer`, for a new watch.
export async function forgetComputer(fetch?: typeof globalThis.fetch) {
  const res = await send(() => apiClient(fetch).api["dive-computer"].$delete())
  if (!res?.ok) throw await failure(res)
  set({ ...state, computer: null })
}
