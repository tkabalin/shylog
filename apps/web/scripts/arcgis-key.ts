import { resolve } from "node:path"
import { loadEnv, type Plugin } from "vite"

// Writes the ArcGIS key into the page, as the server does for an instance:
// in development from the repo's .env (unless the shell sets one, which
// loadEnv prefers), and in the public site's build from CI's secret.
export function arcgisKey(apply?: Plugin["apply"]): Plugin {
  const key =
    loadEnv("development", resolve(import.meta.dirname, "../../.."), "SHYLOG_")
      .SHYLOG_ARCGIS_KEY ?? ""
  return {
    name: "arcgis-key",
    apply,
    transformIndexHtml: (html) =>
      html.replace(
        /(<meta name="shylog-arcgis-key" content=")[^"]*"/,
        // Escaped as the server escapes it.
        (_, start: string) =>
          `${start}${key
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")}"`
      ),
  }
}
