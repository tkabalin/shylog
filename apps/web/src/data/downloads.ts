// Dexie reports a full disk as an abort's inner error, a mock as itself.
const isQuota = (error: unknown): boolean =>
  error instanceof Object &&
  ((error as { name?: unknown }).name === "QuotaExceededError" ||
    isQuota((error as { inner?: unknown }).inner))

// A download after each sync, of profiles or card pages: one run at a time,
// a sync during it leaving its newer list for another. A run that fails ends
// and the next sync tries again, but once a write finds the phone's storage
// full none starts again, as each would fetch the same thing only to drop it.
export function downloader<A extends unknown[]>(
  name: string,
  run: (...args: A) => Promise<void>
) {
  let running: Promise<void> | undefined
  let next: A | undefined
  let full = false
  const start = (...args: A): Promise<void> => {
    if (full) return Promise.resolve()
    next = args
    running ??= (async () => {
      while (next && !full) {
        const now = next
        next = undefined
        await run(...now).catch((error: unknown) => {
          if (isQuota(error)) full = true
          console.debug(`${name} download stopped`, error)
        })
      }
      // Cleared in the same step as the last check of `next`, so a list left
      // after it starts a new run rather than joining one that has ended.
      running = next = undefined
    })()
    return running
  }
  // For tests, each of which starts with room to spare.
  return Object.assign(start, { reset: () => void (full = false) })
}
