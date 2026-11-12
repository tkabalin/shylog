import { useEffect, useRef, useState } from "react"
import { fileDives } from "@shylog/core"
import {
  IconChevronRight,
  IconClipboardCheck,
  IconDeviceWatch,
  IconFileUpload,
} from "@tabler/icons-react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { cn } from "cn"

import { Card } from "@/components/ui/card"
import {
  loadPending,
  uploadExport,
  useImport,
  type LastImport,
} from "@/data/import"
import { useDiveComputer } from "@/data/dive-computer"
import { months } from "@/format/dates"
import { useConnected } from "@/data/sync-status"
import { useDesk } from "@/hooks/use-desk"
import { DiveComputerCard } from "@/import/dive-computer-card"
import { bigButton, ImportSection, ListCard, SummaryRows } from "@/import/parts"

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

// An instant the server stamped, in the phone's zone: "Sun 2 Aug 2026 · 21:40".
function importedAt(at: string) {
  const date = new Date(at)
  const weekday = date.toLocaleString("en-GB", { weekday: "short" })
  const time = date.toLocaleString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  return `${weekday} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()} · ${time}`
}

// The export's days: "18 Jul – 1 Aug 2026", the first year only when it
// differs, or "on 18 Jul 2026" for one day.
function dayRange(from: string, to: string) {
  const parts = (date: string) => ({
    day: `${Number(date.slice(8, 10))} ${months[Number(date.slice(5, 7)) - 1]}`,
    year: date.slice(0, 4),
  })
  const [a, b] = [parts(from), parts(to)]
  if (from === to) return `on ${a.day} ${a.year}`
  return a.year === b.year
    ? `from ${a.day} – ${b.day} ${b.year}`
    : `from ${a.day} ${a.year} – ${b.day} ${b.year}`
}

function fileLine(last: LastImport) {
  if (!last.file) return null
  const { dives, from, to } = last.file
  const count = `${dives} computer ${dives === 1 ? "dive" : "dives"}`
  return from && to ? `${count} ${dayRange(from, to)}` : count
}

// ImportHifi: the upload, a preview waiting for review, and the last
// import. Each step replaces the last, so back from the review or the
// summary never reaches a finished step (see Navigation history).
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
  // ImportHifi's Offline state: the server reads the file, so no upload.
  const connected = useConnected()
  // With the server's cable, the download leads and the upload is the
  // fallback, so its button is outlined.
  const { enabled: downloads } = useDiveComputer()

  useEffect(() => {
    // Offline, the screen says so; asked again once back.
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

  const button = (
    <label
      className={cn(
        "inline-flex w-full cursor-pointer items-center justify-center gap-2 transition-opacity duration-150 select-none [-webkit-touch-callout:none] hover:opacity-90 active:opacity-80 active:duration-0 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
        downloads
          ? "border bg-background text-foreground dark:border-input dark:bg-input/30"
          : "bg-primary text-primary-foreground",
        // Offline it stays where it is, greyed, as ImportHifi draws it.
        "has-disabled:cursor-default has-disabled:bg-muted has-disabled:text-muted-foreground/60 has-disabled:hover:opacity-100 has-disabled:active:opacity-100",
        bigButton
      )}
    >
      <input
        ref={input}
        type="file"
        disabled={!connected}
        accept=".uddf,.xml"
        className="sr-only"
        onChange={(event) => void choose(event.target.files?.[0])}
      />
      <IconFileUpload aria-hidden className="size-[1.15em]" />
      Choose file
    </label>
  )
  const failed = error && (
    <p
      role="alert"
      className="text-center text-[13px] text-pretty text-destructive"
    >
      {error}
    </p>
  )

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col gap-6 px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-10 md:mx-auto md:w-full md:max-w-xl">
        <h1 className="sr-only">Import</h1>
        {/* Kept while a file uploads or the watch downloads, so the card below
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

        <DiveComputerCard
          connected={connected}
          onDownload={(running) => {
            if (running) setBefore(preview)
            setDownloading(running)
          }}
        />

        <Card className="items-center gap-3.5 px-5 pt-7 pb-5.5 text-center">
          <span
            aria-hidden
            className={cn(
              "inline-flex size-13 items-center justify-center rounded-full",
              connected || uploading
                ? "bg-primary/12 text-primary"
                : "bg-muted text-muted-foreground/60"
            )}
          >
            <IconFileUpload className="size-6 stroke-[1.75]" />
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-[17px] font-semibold tracking-[-0.015em]">
              {uploading ? "Reading your export" : "Import from Subsurface"}
            </span>
            <span className="text-sm leading-[1.45] text-pretty text-muted-foreground">
              {uploading
                ? "Matching its dives with your log"
                : connected
                  ? "Choose a UDDF export to attach your dive computer’s profiles to the dives you’ve logged."
                  : "Import needs a connection to the server."}
            </span>
          </span>
          {uploading ? (
            // The preview comes back in one response, so the bar can't say
            // how far along it is.
            <span
              role="progressbar"
              aria-label="Reading your export"
              className="relative block h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <span className="absolute inset-y-0 w-1/3 animate-import-progress rounded-full bg-primary motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-60" />
            </span>
          ) : (
            desk && (
              <>
                {button}
                {failed}
              </>
            )
          )}
        </Card>

        <ImportSection title="Getting the file">
          <ol className="m-0 flex list-none flex-col gap-2.5 px-1 pt-1">
            {[
              "Download the dives from your dive computer in Subsurface.",
              "In Subsurface, choose File › Export › UDDF.",
              "Choose that file here. Nothing changes until you’ve reviewed it.",
            ].map((step, i) => (
              <li
                key={step}
                className="flex items-baseline gap-3 text-sm leading-[1.45] text-muted-foreground"
              >
                <span
                  aria-hidden
                  className="inline-flex size-5.5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
                >
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </ImportSection>

        {loaded && lastImport && (
          <ImportSection title="Last import">
            <ListCard>
              <div className="flex flex-col gap-0.5 px-4 pt-3.5 pb-3">
                <span className="text-[15px] font-medium tabular-nums">
                  {importedAt(lastImport.at)}
                </span>
                {fileLine(lastImport) && (
                  <span className="text-[13px] text-muted-foreground tabular-nums">
                    {fileLine(lastImport)}
                  </span>
                )}
              </div>
              <SummaryRows summary={lastImport} />
            </ListCard>
          </ImportSection>
        )}
      </div>
      {/* On a phone the button sits above the tab bar, in thumb reach,
          rather than in the card at the top; with a mouse it stays in the
          card. While a file uploads, the card shows its progress. */}
      {!desk && !uploading && (
        <div className="bottom-bar sticky bottom-0 z-10 flex flex-col gap-2.5 border-t bg-background px-4 py-3 md:px-[calc(max(0rem,(100%-36rem)/2)+1rem)]">
          {failed}
          {button}
        </div>
      )}
    </div>
  )
}
