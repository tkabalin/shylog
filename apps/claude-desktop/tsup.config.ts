import { defineConfig } from "tsup"

// One file with every dependency in it, as an extension ships no
// node_modules of its own here. It runs on the Node built into Claude
// Desktop, targeting the oldest it has been run on.
export default defineConfig({
  entry: { "server/index": "src/index.ts" },
  format: "esm",
  outExtension: () => ({ js: ".mjs" }),
  platform: "node",
  target: "node22",
  clean: true,
  noExternal: [/.*/],
  // The SDK's dynamic imports stay inside the one file the pack takes.
  splitting: false,
})
