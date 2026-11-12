import { useEffect, useState, type ReactNode } from "react"
import { IconDeviceWatch } from "@tabler/icons-react"
import { useNavigate } from "@tanstack/react-router"
import { cn } from "cn"

import d4i from "@/assets/dive-computers/d4i.webp"
import zoopNovo from "@/assets/dive-computers/zoop-novo.webp"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  ComputerError,
  computerProgress,
  detectComputer,
  downloadFromComputer,
  loadDiveComputer,
  useDiveComputer,
  type Detected,
} from "@/data/dive-computer"
import { computerName } from "@/dive/form/values"
import { instant } from "@/format/dates"
import { bigButton } from "@/import/parts"

// The owner's own pictures of the two supported watches, on solid white,
// so they sit on a white tile in either theme.
const pictures: Record<string, string> = {
  "Suunto D4i": d4i,
  "Suunto Zoop Novo": zoopNovo,
}

type Step =
  | { kind: "idle" }
  | { kind: "looking" }
  | { kind: "found"; watch: Detected }
  | { kind: "downloading"; watch: Detected; readAll: boolean }
  | { kind: "nothingNew"; watch: Detected }
  | { kind: "failed"; error: ComputerError; watch?: Detected }

// What a failure says, as a title over the server's words.
function failedTitle(error: ComputerError, watch?: Detected) {
  switch (error.reason) {
    case "noCable":
      return "No cable"
    case "noWatch":
      return "No dive computer answering"
    case "stopped":
      return watch
        ? `Your ${computerName(watch.model)} stopped answering`
        : "Your dive computer stopped answering"
    case "unreachable":
      return "Couldn’t reach Shylog"
    case "other":
      return "Another dive computer"
    case "busy":
      return "The cable is in use"
    default:
      return watch ? "The download failed" : "Couldn’t open your dive computer"
  }
}

const advice: Partial<Record<ComputerError["reason"], string>> = {
  noCable: "Plug the cable into the server, then try again.",
  busy: "Another download is reading the watch. Try again in a minute.",
  noWatch: "Check the watch is seated in the cable and awake.",
  stopped: "Check the watch is still seated in the cable.",
  failed: "Check the watch is seated in the cable, then try again.",
}

// Its picture on a white tile, or a watch icon for a model without one, in
// the same box either way, so the card keeps its height between states.
function Picture({ model, muted }: { model: string | null; muted: boolean }) {
  const src = model ? pictures[model] : undefined
  if (!src)
    return (
      <span aria-hidden className="flex size-28 items-center justify-center">
        <span
          className={cn(
            "inline-flex size-13 items-center justify-center rounded-full",
            muted
              ? "bg-muted text-muted-foreground/60"
              : "bg-primary/12 text-primary"
          )}
        >
          <IconDeviceWatch className="size-6 stroke-[1.75]" />
        </span>
      </span>
    )
  // Wrapped, as the card takes a bare image first as a full-bleed header.
  return (
    <span className="flex">
      <img
        src={src}
        alt=""
        width={112}
        height={112}
        className={cn(
          // On the white card in light mode the tile needs no edge.
          "size-28 rounded-2xl bg-white object-contain dark:ring-1 dark:ring-white/10",
          muted && "opacity-50 grayscale"
        )}
      />
    </span>
  )
}

// The share of the watch read so far when the server knows it; otherwise,
// opening the watch or matching its dives, a third of the track sweeping.
function Progress({
  label,
  value = null,
}: {
  label: string
  value?: number | null
}) {
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={value == null ? undefined : 0}
      aria-valuemax={value == null ? undefined : 100}
      aria-valuenow={value == null ? undefined : Math.round(value * 100)}
      className="relative block h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      {value == null ? (
        <span className="absolute inset-y-0 w-1/3 animate-import-progress rounded-full bg-primary motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-60" />
      ) : (
        // Eased between the server's answers, a few times a second.
        <span
          className="absolute inset-0 origin-left rounded-full bg-primary transition-transform duration-300 ease-out"
          style={{ transform: `scaleX(${value})` }}
        />
      )}
    </span>
  )
}

// The Import screen's dive computer, when this instance has the cable (see
// Downloading from the dive computer in the spec): Detect opens the watch
// on the server's cable, and a watch found offers its download, which goes
// on to the usual review. Nothing touches the watch until Detect.
export function DiveComputerCard({
  connected,
  onDownload,
}: {
  connected: boolean
  // Told when a download starts and when it ends without a review, so
  // the screen can hold its review banner as the new preview lands.
  onDownload: (running: boolean) => void
}) {
  const { enabled, computer } = useDiveComputer()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>({ kind: "idle" })
  const [read, setRead] = useState<number | null>(null)

  useEffect(() => {
    if (connected) void loadDiveComputer()
  }, [connected])

  // The download answers only once the dives are matched, so how much of
  // the watch it has read is asked for alongside, one ask at a time.
  const downloading = step.kind === "downloading"
  useEffect(() => {
    if (!downloading) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const ask = async () => {
      const progress = await computerProgress()
      if (stopped) return
      // A read that ended, often early at the last dive downloaded, is
      // whole: the bar fills while the dives are matched.
      setRead((before) => progress ?? (before == null ? null : 1))
      timer = setTimeout(() => void ask(), 250)
    }
    void ask()
    return () => {
      stopped = true
      clearTimeout(timer)
      setRead(null)
    }
  }, [downloading])

  if (!enabled) return null

  const detect = async () => {
    setStep({ kind: "looking" })
    try {
      setStep({ kind: "found", watch: await detectComputer() })
    } catch (error) {
      setStep({ kind: "failed", error: error as ComputerError })
    }
  }

  const download = async (watch: Detected, readAll: boolean) => {
    setStep({ kind: "downloading", watch, readAll })
    onDownload(true)
    try {
      const preview = await downloadFromComputer(readAll)
      if (preview) {
        await navigate({ to: "/import/review", replace: true })
        return
      }
      // The download remembered the watch, so it can be read whole now.
      setStep({ kind: "nothingNew", watch: { ...watch, known: true } })
    } catch (error) {
      setStep({ kind: "failed", error: error as ComputerError, watch })
    }
    onDownload(false)
  }

  const watch = "watch" in step ? step.watch : undefined
  const name = watch ? computerName(watch.model) : null
  const remembered = computer && computerName(computer.model)
  // Greyed offline, as the upload's button is.
  const offline =
    "disabled:bg-muted disabled:text-muted-foreground/60 disabled:opacity-100"

  let title: string
  let detail: ReactNode
  let actions: ReactNode = null
  const detectButton = (label: string, outline = false) => (
    <Button
      size="lg"
      variant={outline ? "outline" : "default"}
      disabled={!connected}
      onClick={() => void detect()}
      className={cn("w-full", bigButton, offline)}
    >
      {label}
    </Button>
  )
  // Reading every dive again, for a dive skipped in an earlier review.
  const readAll = (found: Detected) =>
    found.known && (
      <Button
        variant="ghost"
        disabled={!connected}
        onClick={() => void download(found, true)}
        // Sized as the app's other ghost buttons under a primary one.
        className={cn(
          "w-full text-primary disabled:text-muted-foreground/60 disabled:opacity-100",
          bigButton
        )}
      >
        Read every dive again
      </Button>
    )

  switch (step.kind) {
    case "idle":
      title = remembered
        ? `Download from your ${remembered}`
        : "Download from your dive computer"
      detail = `Put ${remembered ? `your ${remembered}` : "it"} on the server’s cable.`
      actions = detectButton("Detect dive computer")
      break
    case "looking":
      title = "Looking for your dive computer"
      detail = "Opening it on the server’s cable"
      actions = <Progress label="Looking for your dive computer" />
      break
    case "found":
      title = step.watch.other ? "Another dive computer" : step.watch.model
      detail = step.watch.other
        ? `This ${name} isn’t the ${remembered ?? "watch"} this log downloads from. To use it, forget your ${remembered ?? "watch"} on the You tab.`
        : step.watch.lastDownloadAt
          ? `Last downloaded ${instant(step.watch.lastDownloadAt)}`
          : "Not downloaded yet"
      actions = step.watch.other ? (
        detectButton("Detect again", true)
      ) : (
        <>
          <Button
            size="lg"
            disabled={!connected}
            onClick={() => void download(step.watch, false)}
            className={cn("w-full", bigButton, offline)}
          >
            Download dives
          </Button>
          {readAll(step.watch)}
        </>
      )
      break
    case "downloading":
      title = `Reading your ${name}`
      detail = step.readAll
        ? "Every dive on it, which takes up to half a minute"
        : "Then matching its dives with your log"
      actions = <Progress label={`Reading your ${name}`} value={read} />
      break
    case "nothingNew":
      title = "No new dives"
      detail = `Your ${name} has nothing since your last download.`
      actions = (
        <>
          {detectButton("Detect again", true)}
          {readAll(step.watch)}
        </>
      )
      break
    case "failed":
      title = failedTitle(step.error, step.watch)
      detail = advice[step.error.reason] ?? step.error.message
      actions = detectButton("Try again")
      break
  }

  return (
    <Card
      aria-live="polite"
      aria-busy={step.kind === "looking" || step.kind === "downloading"}
      className="items-center gap-3 px-5 pt-5 pb-5 text-center"
    >
      {/* The remembered watch until Detect says which is on the cable. */}
      <Picture
        model={watch?.model ?? computer?.model ?? null}
        muted={!connected}
      />
      <span className="flex flex-col gap-1">
        <span className="text-[17px] font-semibold tracking-[-0.015em]">
          {title}
        </span>
        <span className="text-sm leading-[1.45] text-pretty text-muted-foreground tabular-nums">
          {detail}
        </span>
      </span>
      {/* Fitted to each state rather than held at one height: the room a
          second button needs left a gap under the others, and on a phone
          Choose file sits in the bottom bar, so nothing under a thumb moves. */}
      <div className="flex w-full flex-col gap-2">{actions}</div>
    </Card>
  )
}
