import { Card } from "@/components/ui/card"

import { tint } from "./parts"

// StatsHifi's ranked lists: a name, a smaller line beside or under it, the
// count, and a bar against the first, which takes the accent.
export function Ranked({
  label,
  rows,
  stacked = false,
  avatar = false,
}: {
  label: string
  rows: { key: string; name: string; detail?: string | null; count: number }[]
  // The detail under the name (regions) rather than beside it (sites).
  stacked?: boolean
  // Initials before each row (buddies).
  avatar?: boolean
}) {
  const max = rows[0]?.count ?? 1
  return (
    <Card className="gap-0 py-0">
      <ol aria-label={label} className="divide-y">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-3 px-4 py-3">
            {avatar && (
              <span
                aria-hidden
                className={
                  row.count === max
                    ? "flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/9 text-xs font-semibold text-primary dark:bg-primary/14"
                    : "flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
                }
              >
                {initials(row.name)}
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-1.75">
              <span className="flex items-baseline justify-between gap-3">
                <span
                  className={
                    stacked
                      ? "flex min-w-0 flex-col gap-px"
                      : "flex min-w-0 items-baseline gap-2"
                  }
                >
                  <span className="truncate text-[15px] font-medium">
                    {row.name}
                  </span>
                  {row.detail && (
                    <span className="truncate text-[13px] text-muted-foreground">
                      {row.detail}
                    </span>
                  )}
                </span>
                <span
                  className={
                    stacked
                      ? "self-start text-sm font-medium tabular-nums"
                      : "text-sm font-medium tabular-nums"
                  }
                >
                  {row.count}
                </span>
              </span>
              <span
                aria-hidden
                className="block h-1 rounded-[2px]"
                style={{
                  width: `${(row.count / max) * 100}%`,
                  background: row.count === max ? "var(--primary)" : tint(42),
                }}
              />
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

// "Sam Naidoo" → "SN", "Cher" → "C".
const initials = (name: string) => {
  // Words that start with a letter, so "🐙 Octo" is "O"; a name with none
  // shows its first character, by code point so an emoji stays whole.
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
  if (!words.length) return Array.from(name.trim())[0] ?? ""
  const first = Array.from(words[0]!)[0]!
  const last = words.length > 1 ? Array.from(words.at(-1)!)[0]! : ""
  return (first + last).toUpperCase()
}
