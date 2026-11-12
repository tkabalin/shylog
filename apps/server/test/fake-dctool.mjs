#!/usr/bin/env node
// A stand-in for dctool in tests: "downloads" the raw fixtures of one watch
// (fixtures/dctool/<FAKE_DCTOOL_WATCH>), newest first, stopping at the
// fingerprint given with -p, and "parses" a raw file to its fixture XML.
// FAKE_DCTOOL_MODE picks a failure: silent (never answers), noWatch,
// stopped (answers, then hangs), timedOut (answers, then dctool times
// out), busy (another process has the port), failed. With
// FAKE_DCTOOL_SHIFT_EACH, each download moves the dives a further ten years
// on from 2126, so the browser tests find new dives, clear of the seeded log.
// FAKE_DCTOOL_DELAY sets how long each dive takes to read (default none),
// with libdivecomputer's progress line after each.
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
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

// A start (20261024T144900) and its fingerprint moved on by whole years.
const shifted = (name, years) => {
  const [time, print] = name.replace(/\.bin$/, "").split("-")
  const year = Number(time.slice(0, 4)) + years
  const moved = `${year}${time.slice(4)}`
  const bytes =
    (year & 0xff).toString(16).padStart(2, "0") +
    (year >> 8).toString(16).padStart(2, "0")
  return [moved, `${bytes.toUpperCase()}${print.slice(4)}`]
}

if (command === "parse") {
  const file = args.at(-1)
  // The fixture with the same bytes, as a moved file's name isn't its own.
  const raw = readFileSync(file)
  const name = readdirSync(join(fixtures, "raw")).find((found) =>
    readFileSync(join(fixtures, "raw", found)).equals(raw)
  )
  const years = Number(basename(file).slice(0, 4)) - Number(name.slice(0, 4))
  const xml = readFileSync(
    join(fixtures, "xml", name.replace(/\.bin$/, ".xml")),
    "utf8"
  ).replace(
    /<datetime>(\d{4})/,
    (_, year) => `<datetime>${Number(year) + years}`
  )
  writeFileSync(option("-o"), xml)
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
      let years = 0
      if (process.env.FAKE_DCTOOL_SHIFT_EACH && option("-f") === "raw") {
        const counter = `${device}.downloads`
        const count = existsSync(counter)
          ? Number(readFileSync(counter, "utf8"))
          : 0
        writeFileSync(counter, String(count + 1))
        years = 100 + 10 * count
      }
      const names = readdirSync(join(fixtures, "raw"))
        .filter((name) => name < before)
        .sort()
        .reverse()
      const delay = Number(process.env.FAKE_DCTOOL_DELAY ?? 0)
      // As dctool prints it: the share of the watch's memory read so far.
      const progress = (read) =>
        say(
          `Event: progress ${((100 * read) / names.length).toFixed(2)}% (${read}/${names.length})`
        )
      progress(0)
      const next = (i) => {
        const name = names[i]
        const [time, print] = name ? shifted(name, years) : []
        if (!name || print === after) process.exit(0)
        if (option("-f") === "raw")
          copyFileSync(
            join(fixtures, "raw", name),
            template.replace("%t", time).replace("%f", print)
          )
        say(`Dive: number=1, size=1, fingerprint=${print}`)
        progress(i + 1)
        if (delay) setTimeout(() => next(i + 1), delay)
        else next(i + 1)
      }
      next(0)
    }, 50)
  }
}
