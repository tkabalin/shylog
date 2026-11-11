#!/usr/bin/env node
// A stand-in for dctool in tests: "downloads" the raw fixtures of one watch
// (fixtures/dctool/<FAKE_DCTOOL_WATCH>), newest first, stopping at the
// fingerprint given with -p, and "parses" a raw file to its fixture XML.
// FAKE_DCTOOL_MODE picks a failure: silent (never answers), noWatch,
// stopped (answers, then hangs), timedOut (answers, then dctool times
// out), busy (another process has the port), failed.
import { copyFileSync, existsSync, readdirSync } from "node:fs"
import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"

const watch = process.env.FAKE_DCTOOL_WATCH ?? "d4i"
const serial = process.env.FAKE_DCTOOL_SERIAL ?? "12345678"
const mode = process.env.FAKE_DCTOOL_MODE ?? "ok"
// Only dives starting before this, so a test can add a "new" dive.
const before = process.env.FAKE_DCTOOL_BEFORE ?? "9999"
const fixtures = fileURLToPath(
  new URL(`../../../fixtures/dctool/${watch}/`, import.meta.url)
)
const model = watch === "d4i" ? 25 : 30
const args = process.argv.slice(2)
const option = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1]
}
const command = args.find((arg) => ["download", "parse"].includes(arg))
const say = (line) => process.stderr.write(`${line}\n`)
const hang = () => setInterval(() => {}, 1000)

if (command === "parse") {
  const file = args.at(-1)
  copyFileSync(
    join(fixtures, "xml", basename(file).replace(/\.bin$/, ".xml")),
    option("-o")
  )
  process.exit(0)
}

const device = args.at(-1)
if (!existsSync(device)) {
  say("ERROR: No device found")
  process.exit(1)
}
if (mode === "busy") {
  say("ERROR: Error opening the I/O stream. Device or resource busy")
  process.exit(1)
} else if (mode === "silent") hang()
else if (mode === "noWatch") {
  say("ERROR: Failed to identify the protocol variant.")
  process.exit(1)
} else {
  say(
    `Event: model=${model} (0x${model.toString(16).padStart(8, "0")}), firmware=1 (0x00000001), serial=${serial} (0x0)`
  )
  if (mode === "stopped") hang()
  else if (mode === "timedOut") {
    say("ERROR: Timeout")
    process.exit(1)
  } else if (mode === "failed") {
    say("ERROR: Protocol error")
    process.exit(1)
  } else {
    // A moment, as reading a watch takes, so a test can cancel it.
    setTimeout(() => {
      const template = option("-o")
      const after = option("-p")
      const names = readdirSync(join(fixtures, "raw"))
        .filter((name) => name < before)
        .sort()
        .reverse()
      for (const name of names) {
        const [time, print] = name.replace(/\.bin$/, "").split("-")
        if (print === after) break
        if (option("-f") === "raw")
          copyFileSync(
            join(fixtures, "raw", name),
            template.replace("%t", time).replace("%f", print)
          )
        say(`Dive: number=1, size=1, fingerprint=${print}`)
      }
      process.exit(0)
    }, 50)
  }
}
