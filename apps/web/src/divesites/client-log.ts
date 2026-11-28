import type * as log from "@/data/client-log"

// The public site has no server to send its errors to. Swapped in for
// data/client-log.ts by vite.divesites.config.ts.
export const reportError: typeof log.reportError = () => Promise.resolve()
export const isChunkFailure: typeof log.isChunkFailure = () => false
