import { z } from "zod"

import { requestIdPattern } from "../ids.ts"

// Cuts text to a number of UTF-8 bytes without splitting a character, so a
// huge message or stack is shortened rather than refused.
export function cutToBytes(text: string, bytes: number) {
  let used = 0
  let end = 0
  for (const char of text) {
    // Its length in UTF-8: 1 to 4 bytes by code point.
    const code = char.codePointAt(0)!
    used += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
    if (used > bytes) return text.slice(0, end)
    end += char.length
  }
  return text
}

// An error the app hit, for the server's log (`POST /api/client-log`).
// Unknown fields are dropped, and a long message or stack is cut.
export const clientReportSchema = z.object({
  kind: z.enum(["sync", "rejected", "chunk", "error", "rejection"]),
  message: z.string().transform((text) => cutToBytes(text, 2 * 1024)),
  stack: z
    .string()
    .transform((text) => cutToBytes(text, 8 * 1024))
    .optional(),
  // The failed call's, which the server's own line for it carries.
  requestId: z.string().regex(requestIdPattern).optional(),
  // The screen it happened on, such as /dives/dive-…
  route: z.string().max(200).optional(),
  version: z.string().max(64).optional(),
})
export type ClientReport = z.input<typeof clientReportSchema>
