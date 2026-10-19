import js from "@eslint/js"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import { defineConfig, globalIgnores } from "eslint/config"
import globals from "globals"
import tseslint from "typescript-eslint"

export default defineConfig([
  globalIgnores([
    ".claude",
    "**/dist",
    "planning",
    "playwright-report",
    "test-results",
    "apps/web/src/routeTree.gen.ts",
  ]),
  {
    files: ["**/*.{js,ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  // Flat config merges globals, so browser code must not get Node's.
  {
    files: ["**/*.{js,ts,tsx}"],
    ignores: ["apps/web/src/**"],
    languageOptions: { globals: globals.node },
  },
  // Core's tests read the fixture with Vite's ?raw, which the server build
  // can't resolve, so core's own code must not use it or the test helpers.
  {
    files: ["packages/core/src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: "[?&]raw(&|$)", message: "Only tests can use ?raw." },
            { regex: "^(\\.\\./)+test/", message: "Only tests use test/." },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value=/[?&]raw(&|$)/]",
          message: "Only tests can use ?raw.",
        },
      ],
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
    // As in shadcn's Vite template: shadcn files export variants and hooks
    // beside components, and TanStack route files export Route.
    rules: { "react-refresh/only-export-components": "off" },
  },
])
