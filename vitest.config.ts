import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Packages start with no tests; an empty project is not a failure.
    passWithNoTests: true,
    // Off unless `--coverage` is passed; CI does, and adds the table to the
    // run's summary page. Screens and shadcn's components are covered by
    // Playwright, not Vitest, so only the web app's logic is counted.
    coverage: {
      provider: "v8",
      include: [
        "packages/*/src/**",
        "apps/server/src/**",
        "apps/web/src/{data,format,log,dive}/**",
      ],
      exclude: ["**/*.test.{ts,tsx}"],
      reporter: [
        ["text", { file: "coverage.txt", skipFull: false }],
        "text-summary",
      ],
      // Core holds the schemas and the calculations every figure comes
      // from, all pure functions, so every line and branch is tested. Run it
      // over packages/core or the whole repo: a --project run counts no files.
      thresholds: {
        "packages/core/src/**": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // Sync, drafts and upload, where a regression silently loses data.
        // A few points under the 2026-10-31 audit's figures; the React hooks
        // here are covered by Playwright instead.
        "apps/web/src/data/**": {
          statements: 80,
          branches: 70,
          functions: 75,
          lines: 85,
        },
      },
    },
    projects: [
      {
        test: {
          name: "core",
          root: "packages/core",
          environment: "node",
        },
      },
      {
        test: {
          name: "server",
          root: "apps/server",
          environment: "node",
        },
      },
      {
        extends: "apps/web/vite.config.ts",
        test: {
          name: "web",
          root: "apps/web",
          environment: "jsdom",
          setupFiles: ["fake-indexeddb/auto"],
          include: ["src/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
})
