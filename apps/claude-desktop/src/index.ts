import { bridge } from "./bridge.ts"

// The instance's MCP endpoint, which the extension's manifest passes.
const [url] = process.argv.slice(2)
if (!url) {
  console.error("Usage: index.mjs https://<host>.<tailnet>.ts.net/mcp")
  process.exit(2)
}

const session = await bridge(new URL(url))
// Desktop stops a server by closing its stdin.
process.stdin.on("end", () => {
  void session.close().finally(() => process.exit(0))
})
