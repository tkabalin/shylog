import { normaliseName } from "@shylog/core"

// Search in the pickers: a name matches when its folded form (case, accents
// and quotes ignored, as the deduplication key is) contains the query.
// Names that start with it rank first. Returns where the match sits in the
// name as typed, so the matched letters can be bold.
export function matchName(name: string, query: string) {
  const q = normaliseName(query)
  if (!q) return null
  const chars = Array.from(name)
  // Folded char by char, so "ß" → "ss" or "ễ" → "e" still maps back to the
  // letters of the name as typed.
  const folded = chars.map((char) => normaliseName(char) || char)
  const at = folded.join("").indexOf(q)
  if (at < 0) return null
  let start = 0
  for (let length = 0; length < at; start++) length += folded[start].length
  let end = start
  for (let length = 0; length < q.length && end < chars.length; end++)
    length += folded[end].length
  return {
    rank: at === 0 ? 0 : 1,
    parts: [
      chars.slice(0, start).join(""),
      chars.slice(start, end).join(""),
      chars.slice(end).join(""),
    ] as const,
  }
}

export function Highlighted({
  parts,
}: {
  parts: readonly [string, string, string]
}) {
  return (
    <>
      {parts[0]}
      <b className="font-semibold">{parts[1]}</b>
      {parts[2]}
    </>
  )
}

// Spaces tidied, case kept: names are saved as typed (D29).
export const tidyName = (name: string) => name.trim().replace(/\s+/g, " ")

// Grouped as the dates are (en-GB), so a busy site reads "1,234 dives".
export const countText = (count: number) => count.toLocaleString("en-GB")

export const diveCount = (count: number) =>
  `${countText(count)} ${count === 1 ? "dive" : "dives"}`

// Core's `name` schema caps every entity name at 120 characters; a longer
// one typed here would only fail when the dive saves.
export const nameLimit = 120
