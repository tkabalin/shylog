import js from "@eslint/js"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import { defineConfig, globalIgnores } from "eslint/config"
import globals from "globals"
import tseslint from "typescript-eslint"

export default defineConfig([
  globalIgnores([
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
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
    // As in shadcn's Vite template: shadcn files export variants and hooks
    // beside components, and TanStack route files export Route.
    rules: { "react-refresh/only-export-components": "off" },
  },
])
