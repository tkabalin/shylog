import { execFileSync, spawn } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"

// Builds subsurface.cpp and keeps it running, so a property test can ask it
// thousands of questions without starting a process for each. Contraction is
// off because JavaScript never fuses a multiply and add, and an ARM build would.
export function startSubsurface() {
  const dir = mkdtempSync(join(tmpdir(), "shylog-subsurface-"))
  const binary = join(dir, "subsurface")
  const source = fileURLToPath(new URL("subsurface.cpp", import.meta.url))
  execFileSync("c++", [
    "-std=c++17",
    "-O2",
    "-ffp-contract=off",
    "-o",
    binary,
    source,
  ])

  const child = spawn(binary, { stdio: ["pipe", "pipe", "inherit"] })
  const waiting: {
    resolve: (line: string) => void
    reject: (error: Error) => void
  }[] = []
  createInterface({ input: child.stdout }).on("line", (line) =>
    waiting.shift()?.resolve(line)
  )
  child.on("exit", (code) => {
    for (const question of waiting.splice(0)) {
      question.reject(new Error(`The Subsurface reference exited (${code})`))
    }
  })

  return {
    // One line in, one line out, answered in order.
    ask: (question: string) =>
      new Promise<string>((resolve, reject) => {
        waiting.push({ resolve, reject })
        child.stdin.write(`${question}\n`)
      }),
    stop() {
      child.stdin.end()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
