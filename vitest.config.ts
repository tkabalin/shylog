import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Packages start with no tests; an empty project is not a failure.
    passWithNoTests: true,
    // Off unless `--coverage` is passed; CI does, and adds the table to the
    // run's summary page. The web UI is covered by Playwright, not Vitest, so
    // apps/web joins once it has unit-tested code of its own.
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**", "apps/server/src/**"],
      exclude: ["**/*.test.ts"],
      reporter: [
        ["text", { file: "coverage.txt", skipFull: false }],
        "text-summary",
      ],
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
