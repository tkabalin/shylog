import { onTestFinished } from "vitest"

import { logger, logTo } from "../src/log.ts"

export type LogLine = Record<string, unknown>

// The lines the server writes during one test, parsed, debug ones included.
export function captureLog() {
  const lines: LogLine[] = []
  const restore = logTo((line) => void lines.push(JSON.parse(line)))
  const level = logger.level
  logger.level = "debug"
  onTestFinished(() => {
    restore()
    logger.level = level
  })
  return lines
}
