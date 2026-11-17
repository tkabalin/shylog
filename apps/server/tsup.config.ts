import { readFile } from "node:fs/promises"
import path from "node:path"

import { defineConfig } from "tsup"

import pkg from "./package.json" with { type: "json" }

// engines.node is ">=24"; the build targets that major, so a Node LTS bump
// is one edit in package.json.
const nodeMajor = pkg.engines.node.match(/\d+/)?.[0]
if (!nodeMajor) throw new Error(`No Node version in "${pkg.engines.node}"`)

export default defineConfig({
  // The server, the backup tools the scripts run in its container, and the
  // export's worker thread, which jobs/export.ts finds beside its own bundle
  // in dist/.
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
    "export-worker": "src/jobs/export-worker.ts",
  },
  format: "esm",
  target: `node${nodeMajor}`,
  clean: true,
  // Core is TypeScript source in the workspace, which Node won't run from
  // node_modules, so it is bundled in.
  noExternal: ["@shylog/core"],
  // The MCP site tools import the dive site map's sites.ts from the web
  // app, which reads its GeoJSON as text with Vite's ?raw, so the build
  // reads it the same way.
  esbuildPlugins: [
    {
      name: "raw",
      setup(build) {
        // Kept relative, as the namespace's path is written into the
        // bundle as a comment.
        build.onResolve({ filter: /\?raw$/ }, async (args) => {
          const file = await build.resolve(args.path.slice(0, -4), {
            kind: args.kind,
            resolveDir: args.resolveDir,
          })
          if (file.errors.length) return { errors: file.errors }
          return { path: path.relative(".", file.path), namespace: "raw" }
        })
        build.onLoad({ filter: /.*/, namespace: "raw" }, async (args) => ({
          contents: await readFile(args.path, "utf8"),
          loader: "text",
        }))
      },
    },
  ],
})
