import { existsSync, readFileSync } from "node:fs"
import { defineConfig, devices } from "@playwright/test"

const viewport = { width: 390, height: 844 }

// Each stack is a seeded API behind Vite's dev server (the built one serves
// the app itself), on ports of their own
// so a running dev server is never reused. E2E_WEB_PORT and E2E_API_PORT
// move them; a second worktree steps both by at least 4.
const webPort = Number(process.env.E2E_WEB_PORT ?? 5174)
const apiPort = Number(process.env.E2E_API_PORT ?? 3100)
const stack = (n: number) => ({ web: webPort + n, api: apiPort + n })
const origin = (web: number) => `http://localhost:${web}`
type Env = Record<string, string>

// Tests tagged @writes change the log (and put it back), so each browser
// runs them one at a time on a stack of its own, while the read-only tests
// assert the fixture's figures in parallel on the first.
const browsers = [
  { name: "chromium", use: { ...devices["Desktop Chrome"], viewport } },
  { name: "webkit", use: { ...devices["Desktop Safari"], viewport } },
]
const stacks = [stack(0), ...browsers.map((_, i) => stack(i + 1))]
// The app as built, served by a seeded API of its own: only a build has the
// service worker. Tests tagged @built use it and only read, so the browsers
// share it.
const built = apiPort + stacks.length
const builtOrigin = `http://127.0.0.1:${built}`
// Its build costs every run a few seconds, so a run naming spec files that
// have no @built test (a single spec, CI's repeats) goes without it.
const named = process.argv.filter((arg) => /\.spec\.ts(:\d+)*$/.test(arg))
const needsBuilt =
  !named.length ||
  named
    .map((arg) => arg.replace(/(:\d+)+$/, ""))
    .some(
      (file) =>
        !existsSync(file) || readFileSync(file, "utf8").includes("@built")
    )

export default defineConfig({
  testDir: "apps/web/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Retries only sort a flaky test from a broken one: a test that passes on
  // a retry still fails the run, so it can't merge unseen.
  retries: process.env.CI ? 2 : 0,
  failOnFlakyTests: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: origin(stacks[0].web),
    // Only on a retry: tracing every attempt made the suite about 40%
    // slower. A flake is found by repeating it locally instead.
    trace: "on-first-retry",
  },
  projects: [
    ...browsers.map((browser) => ({
      ...browser,
      grepInvert: /@writes|@built/,
    })),
    ...browsers.map((browser, i) => ({
      ...browser,
      name: `${browser.name} writes`,
      grep: /@writes/,
      use: { ...browser.use, baseURL: origin(stacks[i + 1].web) },
      workers: 1,
    })),
    ...browsers.map((browser) => ({
      ...browser,
      name: `${browser.name} built`,
      grep: /@built/,
      use: { ...browser.use, baseURL: builtOrigin },
    })),
  ],
  // The touch-size sample route only exists in Vite's dev server.
  webServer: stacks
    .flatMap(({ web, api }) => [
      {
        command: "apps/web/e2e/api-server.sh",
        // Any answer means it is up; /api refuses a request with no header.
        url: `http://127.0.0.1:${api}/api/version`,
        env: { E2E_ORIGIN: origin(web), E2E_API_PORT: String(api) } as Env,
        reuseExistingServer: false,
        // Without it Playwright sends SIGKILL, so the script's trap never
        // removes the seeded data folder.
        gracefulShutdown: { signal: "SIGTERM" as const, timeout: 5000 },
      },
      {
        command: `pnpm --filter @shylog/web dev --port ${web} --strictPort`,
        url: origin(web),
        // A deps cache each, as servers starting cold would remove and
        // rename one shared folder under each other.
        env: {
          SHYLOG_API_ORIGIN: `http://127.0.0.1:${api}`,
          VITE_CACHE_DIR: `node_modules/.vite-e2e-${web}`,
          E2E_NO_HMR: "1",
        } as Env,
        reuseExistingServer: false,
      },
    ])
    .concat(
      needsBuilt
        ? {
            command: "apps/web/e2e/api-server.sh",
            url: `${builtOrigin}/api/version`,
            env: {
              E2E_ORIGIN: builtOrigin,
              E2E_API_PORT: String(built),
              E2E_BUILD: "1",
              // Checked as the offline page's title, which only the server writes.
              SHYLOG_APP_NAME: "Shylog e2e",
            } as Env,
            reuseExistingServer: false,
            gracefulShutdown: { signal: "SIGTERM" as const, timeout: 5000 },
          }
        : []
    ),
})
