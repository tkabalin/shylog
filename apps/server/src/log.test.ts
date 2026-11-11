import { describe, expect, it, onTestFinished } from "vitest"
import { prettyFactory } from "pino-pretty"

import { testEnv } from "../test/app.ts"
import { captureLog } from "../test/log.ts"
import { configureLog, logger, logTo } from "./log.ts"

// The instance and version stay set, so each test puts the defaults back.
function configure(env: Record<string, string>) {
  configureLog(testEnv(env))
  onTestFinished(() => configureLog(testEnv()))
}

describe("the server's log", () => {
  it("writes one JSON object per line with the fields every line carries", () => {
    // Twice, as tests do: the second replaces the first.
    configure({ TS_HOSTNAME: "mum", SHYLOG_REVISION: "0000000" })
    configure({ TS_HOSTNAME: "dad", SHYLOG_REVISION: "4f2a9c1" })
    const raw: string[] = []
    const restore = logTo((line) => void raw.push(line))
    onTestFinished(restore)
    logger.info({ event: "listening", port: 3000 }, "Listening")

    expect(raw).toHaveLength(1)
    expect(raw[0].endsWith("\n")).toBe(true)
    expect(raw[0].trimEnd()).not.toContain("\n")
    expect(raw[0].match(/"instance"/g)).toHaveLength(1)
    expect(JSON.parse(raw[0])).toEqual({
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/),
      level: "info",
      event: "listening",
      msg: "Listening",
      instance: "dad",
      version: "4f2a9c1",
      port: 3000,
    })
  })

  it("keeps each line's fields to that line", () => {
    const lines = captureLog()
    logger.info({ event: "snapshot", file: "/data/a.db" }, "a")
    logger.info({ event: "export", dives: 3 }, "b")
    expect(lines[1]).not.toHaveProperty("file")
    expect(lines[1]).not.toHaveProperty("requestId")
  })

  it("says dev off a build", () => {
    configure({})
    const lines = captureLog()
    logger.info({ event: "x" }, "x")
    expect(lines[0]).toMatchObject({ instance: "shylog", version: "dev" })
  })

  it("logs an error's message, stack and cause", () => {
    const lines = captureLog()
    const cause = new Error("disk full")
    logger.error(
      { event: "export_failed", err: new Error("write failed", { cause }) },
      "Nightly export failed"
    )
    const err = lines[0].err as { message: string; stack: string }
    expect(err.message).toContain("write failed")
    expect(err.message).toContain("disk full")
    expect(err.stack).toContain("caused by: Error: disk full")
  })

  it("never writes what the diver wrote", () => {
    const lines = captureLog()
    logger.warn(
      {
        event: "test",
        diveId: "dive-1",
        notes: "Saw a whale shark",
        name: "Aliwal Shoal",
        animals: ["ragged-tooth shark"],
        gear: "New fins",
        body: { notes: "Drift dive" },
        dive: { notes: "Strong current", name: "Cathedral", gear: "7 mm" },
      },
      "x"
    )
    const text = JSON.stringify(lines)
    for (const word of [
      "whale",
      "Aliwal",
      "ragged",
      "fins",
      "Drift",
      "current",
      "Cathedral",
      "7 mm",
    ]) {
      expect(text).not.toContain(word)
    }
    expect(lines[0]).toMatchObject({ diveId: "dive-1", dive: {} })
  })

  it("logs debug lines only in development", () => {
    configure({ NODE_ENV: "development" })
    expect(logger.level).toBe("debug")
    configure({ NODE_ENV: "production" })
    expect(logger.level).toBe("info")
  })

  it("reads as plain lines through pino-pretty, as in development", () => {
    const raw: string[] = []
    const restore = logTo((line) => void raw.push(line))
    onTestFinished(restore)
    logger.warn({ event: "request", status: 403 }, "GET /api/log 403")
    const pretty = prettyFactory({ colorize: false })(raw[0])
    expect(pretty).toMatch(/^\[[\d:.]+\] WARN: GET \/api\/log 403\n/)
    expect(pretty).toContain('event: "request"')
  })
})
