import { apiClient } from "@/api/client"

import { unreachable } from "./edits"
import { serverMessage } from "./upload"

type Reply = { ok: boolean; status: number; json(): Promise<unknown> }
// A file's reply, the same for every download whatever body Hono infers.
type FileReply = Reply & { headers: Headers; blob(): Promise<Blob> }

// Why the server didn't give the file: its own reason, or `failed` in
// plain words, as a status code means nothing on the phone and the cause
// is in the server's log. Tailscale Serve, or Vite's proxy, answers 502
// or 504 for a server that is down.
async function failure(res: Reply, failed: string) {
  return new Error(
    (await serverMessage(res)) ??
      ([502, 504].includes(res.status) ? unreachable : failed)
  )
}

// After the row's name ("UDDF export: …").
const downloadFailed = "The server couldn’t make it. Its log says why."

const ask = async <R extends Reply>(request: () => Promise<R>) => {
  try {
    return await request()
  } catch (cause) {
    throw new Error(unreachable, { cause })
  }
}

const downloads = {
  // The share sheet was tried on the owner's phone with application/xml.
  uddf: {
    extension: "uddf",
    type: "application/xml",
    get: (): Promise<FileReply> => apiClient().api.export.uddf.$get(),
  },
  // text/csv, not yet tried in the share sheet on the owner's phone; a
  // refused type falls back to a download.
  csv: {
    extension: "csv",
    type: "text/csv",
    get: (): Promise<FileReply> => apiClient().api.export.csv.$get(),
  },
  snapshot: {
    extension: "db",
    type: "application/vnd.sqlite3",
    get: (): Promise<FileReply> => apiClient().api.export.snapshot.$get(),
  },
}

// The server names the file with the day it was made.
const fileName = (res: FileReply, fallback: string) =>
  /filename="([^"]+)"/.exec(
    res.headers.get("Content-Disposition") ?? ""
  )?.[1] ?? fallback

// A fresh export or snapshot, saved through the share sheet on a phone,
// whose Save to Files lets the diver choose the folder (the owner picked it
// over a plain download, which goes straight to Downloads). A desktop, or
// a browser that can't share the file, downloads it instead.
export async function download(kind: keyof typeof downloads, desk: boolean) {
  const { extension, type, get } = downloads[kind]
  const res = await ask(get)
  if (!res.ok) throw await failure(res, downloadFailed)
  const file = new File(
    [await res.blob()],
    fileName(res, `shylog.${extension}`),
    {
      type,
    }
  )
  if (!desk && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (error) {
      // Closing the sheet without saving is a choice, not a failure.
      if ((error as Error).name === "AbortError") return
      // A slow build can outlast the tap's permission to open the sheet;
      // the download below needs none.
      if ((error as Error).name !== "NotAllowedError") throw error
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement("a")
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  // Long enough for the browser to start reading it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// Export now, after a failed night: the server rewrites its export files
// and says when.
export async function exportNow() {
  const res = await ask(() => apiClient().api.export.run.$post())
  // Under the alert, which already says last night's run failed.
  if (!res.ok)
    throw await failure(
      res,
      "Export now failed too. It’ll run again tonight, and the server’s log says why."
    )
  return (await res.json()).lastExportAt
}
