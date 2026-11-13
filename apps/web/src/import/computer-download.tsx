import { useEffect, useRef, useState, type ReactNode } from "react"
import { IconDeviceWatch } from "@tabler/icons-react"
import { useNavigate } from "@tanstack/react-router"
import { cn } from "cn"

import d4i from "@/assets/dive-computers/d4i.webp"
import zoopNovo from "@/assets/dive-computers/zoop-novo.webp"
import { Progress } from "@/components/progress"
import { Button } from "@/components/ui/button"
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
  unreachable: "Check your connection, then try again.",
}

// Its picture on a white tile, or a watch icon for a model without one, in
// the same box either way, so the hero keeps its height between states.
function Picture({ model, muted }: { model: string | null; muted: boolean }) {
  const src = model ? pictures[model] : undefined
  if (!src)
    // A tile the photo's size, so the hero doesn't open a gap above
    // its title.
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-54 items-center justify-center rounded-3xl bg-muted transition-colors duration-150 ease-out",
          muted ? "text-muted-foreground/60" : "text-muted-foreground"
        )}
      >
        <IconDeviceWatch className="size-24 stroke-[1.25]" />
      </span>
    )
  return (
    <img
      src={src}
      alt=""
      width={216}
      height={216}
      draggable={false}
      className={cn(
        // On the white page in light mode the tile needs no edge; no
        // long-press menu, as it isn't content to save.
        "size-54 rounded-3xl bg-white object-contain transition-[opacity,filter] duration-150 ease-out select-none [-webkit-touch-callout:none] dark:ring-1 dark:ring-white/10",
        muted && "opacity-50 grayscale"
      )}
    />
  )
}

// The Import screen's dive computer (see Downloading from the dive computer
// in the spec): nothing touches the watch until Detect, and a watch found
// offers its download into the usual review. Hero and buttons come apart,
// as a phone puts the buttons above the tab bar; null when downloading is off.
export function useComputerDownload({
  connected,
  uploading,
  onDownload,
}: {
  connected: boolean
  // A file being read, as the server takes one import at a time.
  uploading: boolean
  // Told when a download starts and when it ends without a review, so
  // the screen can hold its review banner as the new preview lands.
  onDownload: (running: boolean) => void
}): { hero: ReactNode; actions: ReactNode } | null {
  const { enabled, computer } = useDiveComputer()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>({ kind: "idle" })
  const [read, setRead] = useState<number | null>(null)
  const slot = useRef<HTMLDivElement>(null)
  // A download can end after the diver has left Import, which then
  // shows its waiting card instead of pulling them into the review.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  // The button pressed gives way to the bar, or the bar to buttons, so
  // focus that fell to the page moves to whatever took its place.
  const shown = useRef(step.kind)
  useEffect(() => {
    if (shown.current === step.kind) return
    shown.current = step.kind
    if (document.activeElement === document.body) slot.current?.focus()
  }, [step.kind])

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
        if (mounted.current)
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
  const disabled = !connected || uploading
  // Greyed offline and while a file uploads.
  const offline =
    "disabled:bg-muted disabled:text-muted-foreground/60 disabled:opacity-100"

  let title: string
  let detail: ReactNode
  let actions: ReactNode = null
  let progress: ReactNode = null
  const detectButton = (label: string, outline = false) => (
    <Button
      size="lg"
      variant={outline ? "outline" : "default"}
      disabled={disabled}
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
        disabled={disabled}
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
      progress = <Progress label="Looking for your dive computer" />
      break
    case "found":
      title = step.watch.other ? "Another dive computer" : step.watch.model
      detail = step.watch.other
        ? `This ${name} isn’t the ${remembered ?? "watch"} this log downloads from. To use it, forget your ${remembered ?? "watch"} on the You tab.`
        : step.watch.lastDownloadAt
          ? `Last downloaded ${instant(step.watch.lastDownloadAt)}`
          : // Remembered, from a download whose dives weren't imported.
            step.watch.known
            ? "Nothing imported from it yet"
            : "Not downloaded yet"
      actions = step.watch.other ? (
        detectButton("Detect again", true)
      ) : (
        <>
          <Button
            size="lg"
            disabled={disabled}
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
        : "Reading, then matching its dives with your log"
      progress = <Progress label={`Reading your ${name}`} value={read} />
      break
    case "nothingNew":
      title = "No new dives"
      detail = `Your ${name} has nothing new since your last download.`
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

  return {
    hero: (
      <div
        aria-live="polite"
        className="flex flex-col items-center gap-4 px-1 text-center"
      >
        {/* The remembered watch until Detect says which is on the cable. */}
        <Picture
          model={watch?.model ?? computer?.model ?? null}
          muted={!connected}
        />
        <span className="flex flex-col gap-1">
          <span className="text-[22px] font-semibold tracking-[-0.02em] text-balance">
            {title}
          </span>
          <span className="text-[15px] leading-[1.45] text-pretty text-muted-foreground tabular-nums">
            {detail}
          </span>
        </span>
      </div>
    ),
    // The bar stands where the buttons were while the watch is read, at a
    // button's height, so the screen and the phone's bar stay put; each
    // step's content fades in. A phone keeps the primary button lowest.
    actions: (
      <div
        key={step.kind}
        ref={slot}
        tabIndex={-1}
        className="flex flex-col-reverse gap-1 transition-opacity duration-150 ease-out outline-none starting:opacity-0 desk:flex-col desk:gap-2"
      >
        {progress ? (
          <div className="flex h-12 items-center desk:h-9">{progress}</div>
        ) : (
          actions
        )}
      </div>
    ),
  }
}
