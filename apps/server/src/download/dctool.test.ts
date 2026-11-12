import { mkdtempSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { afterEach, describe, expect, it } from "vitest"

import {
  d9Fingerprint,
  download as downloadOn,
  DownloadError,
  holdCable,
  identify,
  parse,
  readProgress,
  type DctoolConfig,
} from "./dctool.ts"

// A download holds the cable, as the app's downloads do.
const download = (
  config: DctoolConfig,
  options: Parameters<typeof downloadOn>[1]
) => holdCable(config, () => downloadOn(config, options))

const fake = fileURLToPath(
  new URL("../../test/fake-dctool.mjs", import.meta.url)
)

function setup(mode = "ok") {
  const dir = mkdtempSync(join(tmpdir(), "dctool-"))
  const device = join(dir, "suunto")
  writeFileSync(device, "")
  process.env.FAKE_DCTOOL_MODE = mode
  // Short only where the timeout is what's tested (a watch that never
  // answers; one that answers, then hangs), so a slow spawn under load
  // can't turn another case into a silent watch.
  const timeout = mode === "silent" ? 1000 : mode === "stopped" ? 3000 : 10_000
  const config: DctoolConfig = {
    device,
    command: fake,
    identifyTimeout: timeout,
    downloadTimeout: timeout,
  }
  return { dir, config }
}

afterEach(() => {
  delete process.env.FAKE_DCTOOL_MODE
  delete process.env.FAKE_DCTOOL_WATCH
  delete process.env.FAKE_DCTOOL_DELAY
})

const reason = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as DownloadError).reason
  )

describe("identify", () => {
  it("names the watch by its model and serial", async () => {
    expect(await identify(setup().config)).toEqual({
      model: "Suunto D4i",
      serial: "12345678",
    })
    process.env.FAKE_DCTOOL_WATCH = "zoop-novo"
    expect((await identify(setup().config)).model).toBe("Suunto Zoop Novo")
  })

  it("says at once when the cable isn't there", async () => {
    const { config } = setup()
    const started = Date.now()
    expect(
      await reason(identify({ ...config, device: `${config.device}-gone` }))
    ).toBe("noCable")
    expect(Date.now() - started).toBeLessThan(500)
  })

  it("gives no watch, a silent one and a failed read their own reasons", async () => {
    expect(await reason(identify(setup("noWatch").config))).toBe("noWatch")
    // dctool would retry for longer than the screen should wait.
    expect(await reason(identify(setup("silent").config))).toBe("noWatch")
    // Another instance reading the watch on the same cable.
    expect(await reason(identify(setup("busy").config))).toBe("busy")
    expect(await reason(identify(setup("failed").config))).toBe(null)
  })

  it("refuses a second run while one is going", async () => {
    const { config } = setup("silent")
    const first = identify(config)
    expect(await reason(identify(config))).toBe("busy")
    await reason(first)
  })
})

describe("download", () => {
  it("reads every dive newest first, or only those after a dive", async () => {
    const { dir, config } = setup()
    const all = await download(config, {
      dir: join(dir, "all"),
      after: null,
      accept: () => {},
    })
    expect(all.files).toHaveLength(69)
    expect(all.files[0]).toMatch(/20261024T144900-EA070A180E3100\.bin$/)
    const some = await download(config, {
      dir: join(dir, "some"),
      after: "2026-10-23T19:49:00",
      accept: () => {},
    })
    expect(some.files.map((file) => file.slice(-34, -19))).toEqual([
      "20261024T144900",
    ])
  })

  it("reports how much of the watch it has read while it reads", async () => {
    const { dir, config } = setup()
    process.env.FAKE_DCTOOL_DELAY = "5"
    const seen: (number | null)[] = []
    const watching = setInterval(() => seen.push(readProgress()), 2)
    await download(
      { ...config, downloadTimeout: 5000 },
      { dir: join(dir, "out"), after: null, accept: () => {} }
    )
    clearInterval(watching)
    const fractions = seen.filter((value) => value != null)
    expect(new Set(fractions).size).toBeGreaterThan(5)
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b))
    expect(fractions.at(-1)).toBeLessThanOrEqual(1)
    // Nothing once the read is over, so the screen goes back to waiting.
    expect(readProgress()).toBe(null)
  })

  it("stops before any dive when the watch is refused", async () => {
    const { dir, config } = setup()
    const refused = new Error("not yours")
    await expect(
      download(config, {
        dir: join(dir, "out"),
        after: null,
        accept: () => {
          throw refused
        },
      })
    ).rejects.toBe(refused)
    expect(readdirSync(join(dir, "out"))).toEqual([])
  })

  it("times out a watch that stops answering, and fails a broken read", async () => {
    const options = { after: null, accept: () => {} }
    const stopped = setup("stopped")
    expect(
      await reason(
        download(stopped.config, { ...options, dir: join(stopped.dir, "o") })
      )
    ).toBe("stopped")
    // dctool's own timeout after the watch answered is the same.
    const timedOut = setup("timedOut")
    expect(
      await reason(
        download(timedOut.config, { ...options, dir: join(timedOut.dir, "o") })
      )
    ).toBe("stopped")
    const failed = setup("failed")
    expect(
      await reason(
        download(failed.config, { ...options, dir: join(failed.dir, "o") })
      )
    ).toBe("failed")
  })
})

describe("parse", () => {
  it("writes each raw dive's XML beside it", async () => {
    const { dir, config } = setup()
    const { files } = await download(config, {
      dir: join(dir, "out"),
      after: "2026-10-23T19:49:00",
      accept: () => {},
    })
    expect(await parse(config, "Suunto D4i", files[0])).toContain(
      "<datetime>2026-10-24 14:49:00</datetime>"
    )
  })
})

it("writes a start as the D9 family's fingerprint", () => {
  expect(d9Fingerprint("2022-06-12T11:12:17")).toBe("E607060C0B0C11")
})
