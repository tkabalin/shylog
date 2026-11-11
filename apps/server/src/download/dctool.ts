import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// Runs libdivecomputer's dctool, which the image builds (see the
// Dockerfile): one run at a time, as the cable is one serial port.

// The Suunto D9 family as libdivecomputer's descriptor.c names it, by the
// model number the watch reports; dctool parses a dive by this name.
const models: Record<number, string> = {
  0x0e: "Suunto D9",
  0x0f: "Suunto D6",
  0x12: "Suunto D4",
  0x19: "Suunto D4i",
  0x1a: "Suunto D6i",
  0x1b: "Suunto D9tx",
  0x1c: "Suunto DX",
  0x1d: "Suunto Vyper Novo",
  0x1e: "Suunto Zoop Novo",
  0x1f: "Suunto Zoop Novo",
  0x20: "Suunto D4f",
}

export type DownloadFailure =
  "noCable" | "noWatch" | "stopped" | "failed" | "busy" | "unsupported"

// What went wrong, in words fit for the Import screen.
const messages: Record<DownloadFailure, string> = {
  noCable: "The dive computer's cable isn't plugged in",
  noWatch: "No dive computer is answering on the cable",
  stopped: "The dive computer stopped answering",
  failed: "The download failed",
  busy: "The dive computer is busy with another download",
  unsupported: "This dive computer isn't supported",
}

export class DownloadError extends Error {
  readonly reason: DownloadFailure
  // dctool's own words, for the log only.
  readonly detail: string | undefined

  constructor(reason: DownloadFailure, detail?: string) {
    super(messages[reason])
    this.reason = reason
    this.detail = detail
  }
}

export interface Watch {
  // As Subsurface names it, so screens say "your D4i".
  model: string
  serial: string
}

export interface DctoolConfig {
  // The cable's device, such as /dev/suunto.
  device: string
  // dctool itself; a stand-in in tests.
  command: string
  // A watch answers within a fraction of a second, so one that hasn't by
  // then isn't there: dctool's own retries would take far longer.
  identifyTimeout?: number
  // A full read of a watch takes under half a minute.
  downloadTimeout?: number
}

let running = false

// dctool prints the watch's model and serial once it has opened it; the
// serial's closing " (" so a line cut between chunks isn't read short.
const devinfo = /Event: model=(\d+) .* serial=(\d+) \(/

// A watch that had answered and then timed out stopped, not went missing.
// Another instance has the port open: libdivecomputer opens it exclusively.
const portBusy = /Resource busy|Device or resource busy/i

function failure(stderr: string, code: number | null, answered: boolean) {
  if (/No device found|No such file or directory/i.test(stderr))
    return new DownloadError("noCable", stderr)
  if (portBusy.test(stderr)) return new DownloadError("busy", stderr)
  if (/Failed to identify the protocol variant|Timeout/i.test(stderr))
    return new DownloadError(answered ? "stopped" : "noWatch", stderr)
  return new DownloadError("failed", `exit ${code}: ${stderr}`)
}

function watchOf(match: RegExpExecArray): Watch {
  const model = models[Number(match[1])]
  if (!model) throw new DownloadError("unsupported", match[0])
  return { model, serial: match[2] }
}

interface Run {
  args: string[]
  timeout: number
  // On a timeout before the watch said who it is, nothing answered.
  silent: DownloadFailure
  // Called with the watch once it is known; returning true stops the run.
  onWatch: (watch: Watch) => boolean
}

function run(config: DctoolConfig, { args, timeout, silent, onWatch }: Run) {
  return new Promise<{ watch: Watch | null; cancelled: boolean }>(
    (resolve, reject) => {
      const child = spawn(config.command, args, {
        stdio: ["ignore", "ignore", "pipe"],
      })
      let stderr = ""
      let watch: Watch | null = null
      let cancelled = false
      let error: DownloadError | null = null
      // SIGINT cancels the download cleanly, closing the port; SIGKILL
      // follows if dctool doesn't stop.
      const stop = () => {
        cancelled = true
        child.kill("SIGINT")
        setTimeout(() => child.kill("SIGKILL"), 2000).unref()
      }
      const timer = setTimeout(() => {
        error = new DownloadError(watch ? "stopped" : silent, stderr)
        stop()
      }, timeout)
      child.stderr.setEncoding("utf8")
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk
        const match = !watch && devinfo.exec(stderr)
        if (!match) return
        try {
          watch = watchOf(match)
          if (onWatch(watch)) stop()
        } catch (caught) {
          error = caught as DownloadError
          stop()
        }
      })
      child.on("error", (spawnError) => {
        clearTimeout(timer)
        reject(new DownloadError("failed", spawnError.message))
      })
      child.on("close", (code) => {
        clearTimeout(timer)
        if (error) reject(error)
        else if (cancelled || code === 0) resolve({ watch, cancelled })
        else reject(failure(stderr, code, watch != null))
      })
    }
  )
}

async function exclusive<T>(config: DctoolConfig, work: () => Promise<T>) {
  if (running) throw new DownloadError("busy")
  // Instant, so a missing cable is said at once.
  if (!existsSync(config.device)) throw new DownloadError("noCable")
  running = true
  try {
    return await work()
  } finally {
    running = false
  }
}

// Opens the watch for its model and serial, then cancels the download it
// started, before any dive is read.
export function identify(config: DctoolConfig) {
  return exclusive(config, async () => {
    const { watch } = await run(config, {
      args: ["-d", "Suunto D4i", "download", "-o", "/dev/null", config.device],
      timeout: config.identifyTimeout ?? 8000,
      silent: "noWatch",
      onWatch: () => true,
    })
    if (!watch) throw new DownloadError("noWatch")
    return watch
  })
}

// The start on the watch's clock as the D9 family's fingerprint: the year
// in two bytes, low first, then month, day, hour, minute and second.
export function d9Fingerprint(start: string) {
  const [year, month, day, hour, minute, second] = start
    .split(/[-T:]/)
    .map(Number)
  return [year & 0xff, year >> 8, month, day, hour, minute, second]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
}

export interface Download {
  watch: Watch
  // Each dive's raw file, newest first, as the watch gives them.
  files: string[]
}

// Downloads the dives after `after` (a start on the watch's clock), or all
// of them, as raw files into `dir`. `accept` refuses a watch by throwing,
// which stops the read before any dive.
export function download(
  config: DctoolConfig,
  options: { dir: string; after: string | null; accept: (watch: Watch) => void }
) {
  return exclusive(config, async () => {
    mkdirSync(options.dir, { recursive: true })
    let refusal: unknown = null
    const { watch } = await run(config, {
      args: [
        // Both models are opened alike; the watch reports which it is.
        "-d",
        "Suunto D4i",
        "download",
        ...(options.after ? ["-p", d9Fingerprint(options.after)] : []),
        "-f",
        "raw",
        "-o",
        join(options.dir, "%t-%f.bin"),
        config.device,
      ],
      timeout: config.downloadTimeout ?? 120_000,
      silent: "noWatch",
      onWatch: (found) => {
        try {
          options.accept(found)
          return false
        } catch (error) {
          refusal = error
          return true
        }
      },
    })
    if (refusal) throw refusal
    if (!watch) throw new DownloadError("failed", "dctool named no watch")
    const files = readdirSync(options.dir)
      .filter((name) => name.endsWith(".bin"))
      .sort()
      .reverse()
      .map((name) => join(options.dir, name))
    return { watch, files }
  })
}

// One raw dive as dctool's XML, kept beside it.
export function parse(config: DctoolConfig, model: string, file: string) {
  const xml = file.replace(/\.bin$/, ".xml")
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      config.command,
      ["-q", "-d", model, "parse", "-o", xml, file],
      { stdio: ["ignore", "ignore", "pipe"] }
    )
    let stderr = ""
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk))
    child.on("error", (error) =>
      reject(new DownloadError("failed", error.message))
    )
    child.on("close", (code) =>
      code === 0
        ? resolve(readFileSync(xml, "utf8"))
        : reject(new DownloadError("failed", `parse exit ${code}: ${stderr}`))
    )
  })
}
