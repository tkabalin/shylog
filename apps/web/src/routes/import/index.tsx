import { useEffect, useRef, useState } from "react"
import { fileDives } from "@shylog/core"
import {
  IconChevronRight,
  IconClipboardCheck,
  IconDeviceWatch,
  IconFilePlus,
  IconFileUpload,
  IconPlayerSkipForward,
  IconPlugConnected,
  IconSwimming,
} from "@tabler/icons-react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { cn } from "cn"

import { OfflineMark } from "@/components/offline-mark"
import { Card } from "@/components/ui/card"
import {
  loadPending,
  uploadExport,
  useImport,
  type LastImport,
} from "@/data/import"
import { instant } from "@/format/dates"
import { useConnected } from "@/data/sync-status"
import { useDesk } from "@/hooks/use-desk"
import { Progress } from "@/components/progress"
import { useComputerDownload } from "@/import/computer-download"
import { ImportSection } from "@/import/parts"

export const Route = createFileRoute("/import/")({
  component: ImportPage,
})

const day = 24 * 60 * 60 * 1000

function expiry(expiresAt: string, now = new Date()) {
  const left = new Date(expiresAt).getTime() - now.getTime()
  if (left < day) return "expires today"
  if (left < 2 * day) return "expires tomorrow"
  return `expires in ${Math.floor(left / day)} days`
}

// What the last import did, two to a row. A count of none is left out,
// and the left-out dives the review included count as new; the dives that
// never went into the log are muted, so paired and new read first.
function LastImportCounts({ last }: { last: LastImport }) {
  const counts = [
    { icon: IconPlugConnected, value: last.paired, label: "paired" },
    { icon: IconFilePlus, value: last.added + last.included, label: "new" },
    {
      icon: IconPlayerSkipForward,
      value: last.alreadyImported,
      label: "already imported",
      muted: true,
    },
    { icon: IconSwimming, value: last.leftOut, label: "left out", muted: true },
  ]
  // An import that skipped every dive still says it added none.
  const shown = counts.filter((count) => count.value > 0)
  if (!shown.length) shown.push(counts[1])
  return (
    <Card className="gap-0 px-4 py-3.5">
      <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-2.5 p-0 text-[15px] text-muted-foreground tabular-nums">
        {shown.map(({ icon: Icon, value, label, muted }) => (
          // Sized so "already imported" just fits its column on a 390 px
          // phone; a narrower one wraps it.
          <li key={label} className="flex items-center gap-1.25">
            <Icon aria-hidden className="size-4.25 shrink-0 stroke-[1.8]" />
            <span>
              <span
                className={cn("font-semibold", !muted && "text-foreground")}
              >
                {value}
              </span>{" "}
              {label}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// A preview waiting for review, the dive computer when this instance has
// its cable, the Subsurface upload, and the last import. Each step
// replaces the last, so back from the review or the summary never reaches
// a finished step (see Navigation history).
function ImportPage() {
  const { loaded, preview, lastImport } = useImport()
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  // The preview from before the upload or download. The new one lands in
  // the store a moment before the review opens, and would flash its card.
  const [before, setBefore] = useState(preview)
  const shown = uploading || downloading ? before : preview
  const [error, setError] = useState<string>()
  const desk = useDesk()
  // The server reads the file and the watch, so neither works offline.
  const connected = useConnected()
  const computer = useComputerDownload({
    connected,
    uploading,
    onDownload: (running) => {
      if (running) setBefore(preview)
      setDownloading(running)
    },
  })

  useEffect(() => {
    // Asked again once back online.
    if (connected) loadPending().catch(() => {})
  }, [connected])

  const choose = async (file: File | undefined) => {
    if (!file) return
    setBefore(preview)
    setUploading(true)
    setError(undefined)
    try {
      await uploadExport(file)
      await navigate({ to: "/import/review", replace: true })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      setUploading(false)
    }
    // The same file can be chosen again after a failure.
    if (input.current) input.current.value = ""
  }

  // Greyed where it is offline and while the watch downloads, as the
  // server reads one thing at a time.
  const dim = !connected || downloading

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col gap-7 px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-10 md:mx-auto md:w-full md:max-w-xl">
        <h1 className="sr-only">Import</h1>
        {/* Kept while a file uploads or the watch downloads, so the screen
            doesn't jump and the new preview doesn't flash its card. */}
        {shown && (
          <Link
            to="/import/review"
            replace
            className="flex items-center gap-3 rounded-xl bg-card py-3.5 pr-3 pl-4 ring-[1.5px] ring-primary transition-colors duration-150 select-none [-webkit-touch-callout:none] hover:bg-muted/60 data-press:bg-muted data-press:duration-0"
          >
            <span
              aria-hidden
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary"
            >
              <IconClipboardCheck className="size-[19px] stroke-[1.9]" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="text-base font-semibold tracking-[-0.01em]">
                Import waiting for review
              </span>
              <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground tabular-nums">
                <IconDeviceWatch
                  aria-hidden
                  className="size-[1.15em] shrink-0"
                />
                {fileDives(shown)} computer{" "}
                {fileDives(shown) === 1 ? "dive" : "dives"} ·{" "}
                {expiry(shown.expiresAt)}
              </span>
            </span>
            <IconChevronRight
              aria-hidden
              className="size-4.5 shrink-0 text-muted-foreground/60"
            />
          </Link>
        )}

        {computer && (
          <div className="flex flex-col gap-4 pt-3">
            {computer.hero}
            {/* With a mouse the buttons stay under the watch. */}
            {desk && computer.actions}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-card py-3 pr-3.5 pl-3 ring-1 ring-foreground/10 transition-colors duration-150 select-none [-webkit-touch-callout:none] hover:bg-muted/40 has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:pointer-events-none data-press:bg-muted/60 data-press:duration-0">
            <input
              ref={input}
              type="file"
              disabled={dim || uploading}
              accept=".uddf,.xml"
              className="sr-only"
              onChange={(event) => void choose(event.target.files?.[0])}
            />
            <span
              aria-hidden
              className={cn(
                "inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-muted text-muted-foreground transition-opacity duration-150 ease-out",
                dim && "opacity-45"
              )}
            >
              <IconFileUpload className="size-[21px] stroke-[1.8]" />
            </span>
            <span
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-px transition-opacity duration-150 ease-out",
                dim && "opacity-45"
              )}
            >
              <span className="text-[15px] font-medium">
                {uploading ? "Reading your export" : "Import a Subsurface file"}
              </span>
              {uploading ? (
                // The preview comes back in one response, so the bar can't
                // say how far along it is.
                // At the subtitle's line height, so the row keeps its own.
                <span className="flex h-lh items-center text-[13px]">
                  <Progress label="Reading your export" />
                </span>
              ) : (
                <span className="text-[13px] text-muted-foreground">
                  File › Export › UDDF
                </span>
              )}
            </span>
            {/* The page's one sign that the server is out of reach, beside
                the chevron rather than in its place. */}
            <OfflineMark show={!connected} />
            {!uploading && (
              <IconChevronRight
                aria-hidden
                className={cn(
                  "size-4.5 shrink-0 text-muted-foreground/60 transition-opacity duration-150 ease-out",
                  dim && "opacity-45"
                )}
              />
            )}
          </label>
          {error && (
            <p
              role="alert"
              className="px-1 text-[13px] text-pretty text-destructive"
            >
              {error}
            </p>
          )}
        </div>

        {loaded && lastImport && (
          <ImportSection
            title="Last import"
            aside={
              <span className="font-normal">{instant(lastImport.at)}</span>
            }
          >
            <LastImportCounts last={lastImport} />
          </ImportSection>
        )}
      </div>
      {/* On a phone the watch's buttons sit above the tab bar, in thumb
          reach, with its progress in their place while it's read. */}
      {!desk && computer && (
        <div className="bottom-bar sticky bottom-0 z-10 border-t bg-background px-4 py-3 md:px-[calc(max(0rem,(100%-36rem)/2)+1rem)]">
          {computer.actions}
        </div>
      )}
    </div>
  )
}
