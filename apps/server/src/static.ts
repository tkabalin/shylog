import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"

// apps/web/dist, two folders up from both src/ (tsx) and dist/ (the build).
export const defaultWebRoot = fileURLToPath(
  new URL("../../web/dist", import.meta.url)
)

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// The PWA. The page title and manifest name come from SHYLOG_APP_NAME at
// run time, so two instances installed on one phone are told apart. None of
// this passes the /api checks: the browser fetches it without the header.
export function web(root: string, appName: string) {
  let page: string | undefined
  const index = () =>
    (page ??= readFileSync(join(root, "index.html"), "utf8").replace(
      /<title>[^<]*<\/title>/,
      // A function, so a `$` in the name is never read as a pattern.
      () => `<title>${escapeHtml(appName)}</title>`
    ))

  return (
    new Hono()
      .get("/manifest.webmanifest", (c) => {
        c.header("Content-Type", "application/manifest+json")
        c.header("Cache-Control", "no-cache")
        return c.body(
          JSON.stringify({
            name: appName,
            short_name: appName,
            start_url: "/",
            scope: "/",
            display: "standalone",
            background_color: "#ffffff",
            theme_color: "#ffffff",
            icons: [
              // Full bleed with the shark in the safe zone, so it serves
              // both, listed apart as browsers prefer.
              ...["any", "maskable"].map((purpose) => ({
                src: "/icon.svg",
                sizes: "any",
                type: "image/svg+xml",
                purpose,
              })),
            ],
          })
        )
      })
      .on(["GET", "HEAD"], ["/", "/index.html"], (c) => {
        c.header("Cache-Control", "no-cache")
        return c.html(index())
      })
      // Vite hashes everything under assets/; the rest, such as the service
      // worker, must be checked on every load.
      .use("*", async (c, next) => {
        await next()
        if (c.res.status === 200 && !c.res.headers.has("Cache-Control")) {
          c.res.headers.set(
            "Cache-Control",
            c.req.path.startsWith("/assets/")
              ? "public, max-age=31536000, immutable"
              : "no-cache"
          )
        }
      })
      .use("*", serveStatic({ root }))
      // Client-side routes get the app; a missing file or API path doesn't.
      .get("*", (c) => {
        if (c.req.path.startsWith("/api/") || /\.[^/]*$/.test(c.req.path)) {
          return c.notFound()
        }
        c.header("Cache-Control", "no-cache")
        return c.html(index())
      })
  )
}
