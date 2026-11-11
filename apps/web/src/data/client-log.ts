import { clientReportSchema, type ClientReport } from "@shylog/core"

import { apiClient } from "@/api/client"

// A call the server answered with an error, carrying the id its log line
// has, so the report can be matched to it.
export class RequestFailed extends Error {
  readonly requestId?: string

  constructor(message: string, requestId?: string) {
    super(message)
    this.requestId = requestId
  }
}

// A request that got no answer at all, as fetch rejects. Only this is the
// server out of reach: a failure on the phone, such as a database error,
// would otherwise show Can't reach and retry every 5 s on a working server.
export class NoAnswer extends Error {}

export const answered =
  (fetch?: typeof globalThis.fetch): typeof globalThis.fetch =>
  (input, init) =>
    (fetch ?? globalThis.fetch)(input, init).catch((error: unknown) => {
      if (error instanceof NoAnswer) throw error
      throw new NoAnswer(String(error), { cause: error })
    })

export const requestIdOf = (res: { headers: Headers }) =>
  res.headers.get("X-Request-Id") ?? undefined

// What each browser says when a code-split chunk didn't load.
const chunkFailure =
  /dynamically imported module|Importing a module script failed|Unable to preload/i

export const isChunkFailure = (error: unknown) =>
  error instanceof Error && chunkFailure.test(error.message)

const sentAt = new Map<string, number>()

// Sends one of the app's errors to the server's log. The same error within
// a minute goes once; one that can't be sent is dropped, never queued, so a
// phone offline doesn't save up a burst for later. Never throws.
export function reportError(kind: ClientReport["kind"], error: unknown) {
  // Never in the way of the caller's own handling, such as the retry a
  // failed sync schedules after reporting, whatever was thrown.
  try {
    if (!navigator.onLine) return Promise.resolve()
    const message = error instanceof Error ? error.message : String(error)
    // By message alone: a lazy load that failed is reported where it
    // failed and again as an unhandled rejection, under another kind.
    const now = Date.now()
    if (now - (sentAt.get(message) ?? -Infinity) < 60_000)
      return Promise.resolve()
    // Only the last minute's, so a long session's errors don't pile up here.
    for (const [sent, at] of sentAt) if (now - at >= 60_000) sentAt.delete(sent)
    sentAt.set(message, now)
    const report = clientReportSchema.safeParse({
      kind,
      message,
      stack: error instanceof Error ? error.stack : undefined,
      requestId: error instanceof RequestFailed ? error.requestId : undefined,
      route: location.pathname.slice(0, 200),
      version: (import.meta.env.VITE_REVISION as string | undefined) ?? "dev",
    })
    if (!report.success) return Promise.resolve()
    return apiClient()
      .api["client-log"].$post({ json: report.data })
      .then(
        () => {},
        () => {}
      )
  } catch {
    return Promise.resolve()
  }
}

// For tests: each starts with nothing sent.
export const forgetReports = () => sentAt.clear()

// Errors nothing else caught, from any code on the page.
export function startErrorReports() {
  window.addEventListener("error", (event) => {
    void reportError("error", event.error ?? event.message)
  })
  window.addEventListener("unhandledrejection", (event) => {
    const kind = isChunkFailure(event.reason) ? "chunk" : "rejection"
    void reportError(kind, event.reason)
  })
  // Vite's preload of a chunk's own imports.
  window.addEventListener("vite:preloadError", (event) => {
    void reportError("chunk", (event as Event & { payload: unknown }).payload)
  })
}
