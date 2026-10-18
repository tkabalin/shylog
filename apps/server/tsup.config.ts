import { defineConfig } from "tsup"

import pkg from "./package.json" with { type: "json" }

// engines.node is ">=24"; the build targets that major, so a Node LTS bump
// is one edit in package.json.
const nodeMajor = pkg.engines.node.match(/\d+/)?.[0]
if (!nodeMajor) throw new Error(`No Node version in "${pkg.engines.node}"`)

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: `node${nodeMajor}`,
  clean: true,
})
