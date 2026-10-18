import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Packages start with no tests; an empty project is not a failure.
    passWithNoTests: true,
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
