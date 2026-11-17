import { readFileSync } from "node:fs"
import { registerHooks } from "node:module"

// Vite's ?raw for the server's source under tsx (`tsx --import` this file),
// as the MCP site tools import the dive site map's sites.ts from the web
// app, which reads its GeoJSON as text. Vitest has it already, and the
// build reads it the same way (tsup.config.ts).
registerHooks({
  load(url, context, nextLoad) {
    if (!url.endsWith("?raw")) return nextLoad(url, context)
    const file = new URL(url)
    file.search = ""
    return {
      format: "module",
      source: `export default ${JSON.stringify(readFileSync(file, "utf8"))}`,
      shortCircuit: true,
    }
  },
})
