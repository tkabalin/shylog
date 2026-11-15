// Packs the Claude Desktop extension for one instance:
//   pnpm --filter @shylog/claude-desktop extension <instance> <https://host/mcp>
// runs tsup, then this, which writes shylog-<instance>.mcpb here for Desktop
// to install from Settings > Extensions.
import { readFileSync, writeFileSync } from "node:fs"

import pkg from "../package.json" with { type: "json" }
import { zip } from "./zip.ts"

const [instance, url] = process.argv.slice(2)
if (!instance || !/^[a-z0-9-]+$/.test(instance) || !url) {
  console.error("Usage: pack <instance> https://<host>.<tailnet>.ts.net/mcp")
  process.exit(2)
}
// Plain HTTP only for a dev server on this computer, which Tailscale's
// HTTPS doesn't front.
const endpoint = new URL(url)
const local = endpoint.protocol === "http:" && endpoint.hostname === "localhost"
if (
  !(endpoint.protocol === "https:" || local) ||
  endpoint.pathname !== "/mcp"
) {
  console.error(`Expected the instance's https://…/mcp, not ${url}`)
  process.exit(2)
}

// An extension is known by its name, so each instance gets its own and two
// can sit side by side. The URL is fixed in, as nothing about it is secret.
const manifest = {
  manifest_version: "0.3",
  name: `shylog-${instance}`,
  display_name: `Shylog (${instance})`,
  version: pkg.version,
  description:
    "Your Shylog dive log in Claude: look dives up by number, search the log, and log or edit dives.",
  author: { name: "Shylog" },
  license: pkg.license,
  // The shark from the web app's favicon, rendered by scripts/icon.ts.
  icon: "icon.png",
  server: {
    type: "node",
    entry_point: "server/index.mjs",
    mcp_config: {
      command: "node",
      args: ["${__dirname}/server/index.mjs", endpoint.href],
    },
  },
  // The tools come from the instance, so none are listed here.
  tools_generated: true,
  compatibility: { runtimes: { node: ">=22" } },
}

const out = `shylog-${instance}.mcpb`
writeFileSync(
  out,
  zip([
    ["manifest.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)],
    ["server/index.mjs", readFileSync("dist/server/index.mjs")],
    ["icon.png", readFileSync("icon.png")],
  ])
)
console.log(`Wrote ${out}`)
