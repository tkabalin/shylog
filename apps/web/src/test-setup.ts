import { vi } from "vitest"

// Any test that hits a failure would otherwise post a report to the jsdom
// origin, a real request; client-log.test.ts checks the reports themselves.
vi.mock("@/data/client-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/client-log")>()),
  reportError: vi.fn(async () => {}),
  // Its listeners would call the real reportError, not this stub.
  startErrorReports: vi.fn(),
}))
