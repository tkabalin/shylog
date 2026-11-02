import { useState } from "react"
import {
  IconDatabase,
  IconDownload,
  IconFileTypeXml,
} from "@tabler/icons-react"
import { cn } from "cn"

import { Spinner } from "@/components/ui/spinner"
import { download } from "@/data/export"
import { Section } from "@/dive/form/rows"
import { useDesk } from "@/hooks/use-desk"
import { listRow, pressable, RowContent, SaveFailure } from "@/you/parts"

const rows = [
  {
    kind: "uddf",
    icon: IconFileTypeXml,
    title: "UDDF export",
    sub: "Opens in Subsurface",
  },
  {
    kind: "snapshot",
    icon: IconDatabase,
    title: "Database snapshot",
    sub: "The SQLite file",
  },
] as const

type Kind = (typeof rows)[number]["kind"]
const title = (kind: Kind) => rows.find((row) => row.kind === kind)!.title

// You's Download section: each row builds its file on the server when
// tapped and hands it to the share sheet (a download on a desktop). A
// UDDF export also replaces the server's copy, so `onExport` asks for the
// new "Last UDDF export" time.
export function Downloads({ onExport }: { onExport: () => void }) {
  const desk = useDesk()
  const [busy, setBusy] = useState<Partial<Record<Kind, boolean>>>({})
  const [error, setError] = useState<string>()

  const run = async (kind: Kind) => {
    // A second tap while it builds would only build it again.
    if (busy[kind]) return
    setBusy((now) => ({ ...now, [kind]: true }))
    setError(undefined)
    try {
      await download(kind, desk)
    } catch (failure) {
      // One line for both rows, so it says which.
      setError(`${title(kind)}: ${(failure as Error).message}`)
    } finally {
      setBusy((now) => ({ ...now, [kind]: false }))
      if (kind === "uddf") onExport()
    }
  }

  return (
    <Section title="Download" note={<SaveFailure error={error} />}>
      {rows.map(({ kind, icon: Icon, title, sub }) => (
        <button
          key={kind}
          type="button"
          // Not disabled, which would grey the row out as if unavailable.
          aria-busy={busy[kind]}
          onClick={() => void run(kind)}
          className={cn(listRow, pressable, "group min-h-15")}
        >
          <span
            aria-hidden
            // Darker while pressed, or it would vanish into the row's own
            // pressed fill.
            className="inline-flex size-7.5 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-active:bg-foreground/10"
          >
            <Icon className="size-[17px] stroke-[1.9]" />
          </span>
          <RowContent label={title} sub={sub} />
          {busy[kind] ? (
            // The button says it's busy; a second status would compete
            // with the sync card's.
            <Spinner
              role={undefined}
              aria-label={undefined}
              aria-hidden
              className="size-4.5 shrink-0 text-muted-foreground"
            />
          ) : (
            <IconDownload
              aria-hidden
              className="size-4.5 shrink-0 text-muted-foreground/60"
            />
          )}
        </button>
      ))}
    </Section>
  )
}
