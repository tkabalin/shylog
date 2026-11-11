import { AsyncLocalStorage } from "node:async_hooks"

import { pino } from "pino"

import type { Env } from "./env.ts"

// Where lines go: stdout, which Docker's log driver collects. Swappable so
// tests can read the lines and the CLI can keep stdout for a person.
let write: (line: string) => void = (line) => void process.stdout.write(line)

export function logTo(next: (line: string) => void) {
  const before = write
  write = next
  return () => {
    write = before
  }
}

// Logs hold ids, counts and timings, never what the diver wrote. Dropped
// at the top level and one below, as in `{ dive: { notes } }`.
const contents = ["body", "notes", "name", "names", "animals", "gear"]

// The request a line was written during, so code deep in an import logs
// under the id the phone sent without being handed a logger.
const request = new AsyncLocalStorage<string>()

// Which instance and build each line comes from, set once at startup. Kept
// here rather than in pino's bindings, which a second call adds to.
let bindings: { instance?: string; version?: string } = {}

export const duringRequest = <T>(requestId: string, run: () => T) =>
  request.run(requestId, run)

// One JSON object per line, with its level as a word and an ISO time, so
// a LogQL `| json` reads every field. Each line also carries an `event`.
export const logger = pino(
  {
    // Not pino's pid and hostname: in the container they say nothing that
    // `instance` doesn't.
    base: {},
    timestamp: pino.stdTimeFunctions.isoTime,
    // A fresh object every line: pino assigns the line's own fields into
    // the mixin's, which would otherwise carry them into every later line.
    mixin: () => ({ ...bindings, requestId: request.getStore() }),
    formatters: { level: (label) => ({ level: label }) },
    redact: {
      paths: contents.flatMap((field) => [field, `*.${field}`]),
      remove: true,
    },
  },
  { write: (line: string) => write(line) }
)

// At startup, before anything logs: which instance and build each line
// comes from, and debug lines (the phones' polls) only in development.
export function configureLog(env: Env) {
  bindings = { instance: env.TS_HOSTNAME, version: env.SHYLOG_REVISION }
  logger.level = env.NODE_ENV === "development" ? "debug" : "info"
}
