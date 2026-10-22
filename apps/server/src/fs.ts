import { closeSync, fsyncSync, openSync } from "node:fs"

// A rename is only on disk once its folder is flushed too.
export function syncDir(path: string) {
  const fd = openSync(path, "r")
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}
