import { defineConfig, devices } from "@playwright/test"

const viewport = { width: 390, height: 844 }

// Each stack is a seeded API behind Vite's dev server, on ports of their own
// so a running dev server is never reused. E2E_WEB_PORT and E2E_API_PORT
// move them; a second worktree steps both by at least 3.
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

export default defineConfig({
  testDir: "apps/web/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: origin(stacks[0].web),
    trace: "on-first-retry",
  },
  projects: [
    ...browsers.map((browser) => ({ ...browser, grepInvert: /@writes/ })),
    ...browsers.map((browser, i) => ({
      ...browser,
      name: `${browser.name} writes`,
      grep: /@writes/,
      use: { ...browser.use, baseURL: origin(stacks[i + 1].web) },
      workers: 1,
    })),
  ],
  // The touch-size sample route only exists in Vite's dev server.
  webServer: stacks.flatMap(({ web, api }) => [
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
      } as Env,
      reuseExistingServer: false,
    },
  ]),
})
