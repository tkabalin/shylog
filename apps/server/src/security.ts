import { createMiddleware } from "hono/factory"

import type { Env } from "./env.ts"

// Tailscale Serve sends a login with non-ASCII characters as an RFC 2047
// encoded word, which it writes with Go's mime.QEncoding in UTF-8. Long
// values are split into several words, and the space between them is not
// part of the value.
const encodedWord = /=\?utf-8\?q\?([^?]*)\?=/gi

export function decodeLogin(value: string): string {
  return value
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(encodedWord, (_, text: string) => {
      const bytes: number[] = []
      for (let i = 0; i < text.length; i++) {
        if (text[i] === "_") bytes.push(0x20)
        else if (
          text[i] === "=" &&
          /^[0-9a-f]{2}$/i.test(text.slice(i + 1, i + 3))
        ) {
          bytes.push(parseInt(text.slice(i + 1, i + 3), 16))
          i += 2
        } else bytes.push(text.charCodeAt(i))
      }
      return new TextDecoder().decode(new Uint8Array(bytes))
    })
}

const json = ["application/json"]
// Each body a route takes; everything else sends JSON.
const bodyTypes: { method: string; path: RegExp; types: string[] }[] = [
  {
    method: "POST",
    path: /^\/api\/import$/,
    types: ["application/xml", "text/xml", "application/octet-stream"],
  },
  {
    method: "PUT",
    // A card's own path, not /api/cards/order, which sends JSON.
    path: /^\/api\/cards\/card-[^/]+$/,
    types: ["multipart/form-data"],
  },
]

export const readOnly = new Set(["GET", "HEAD", "OPTIONS"])

// The checks every /api request passes (see Security in the spec). The
// custom header makes a browser preflight any cross-site request, the
// Origin and content type catch the ones that slip through, and the login
// is the person Tailscale Serve vouches for. Tagged devices send no login.
export function security(env: Env) {
  const allowed = new Set(env.SHYLOG_ALLOWED_LOGINS)
  return createMiddleware(async (c, next) => {
    const refuse = (error: string) => c.json({ error }, 403)

    if (c.req.header("X-Shylog") === undefined)
      return refuse("Missing X-Shylog")

    const header = c.req.header("Tailscale-User-Login")
    const login = header ? decodeLogin(header) : env.SHYLOG_DEV_LOGIN
    if (!login || !allowed.has(login)) return refuse("Login not allowed")

    if (!readOnly.has(c.req.method)) {
      if (c.req.header("Origin") !== env.SHYLOG_ORIGIN) {
        return refuse("Wrong origin")
      }
      // A request with no body, such as a delete, has no type to check.
      const type = c.req.header("Content-Type")
      const hasBody =
        type !== undefined ||
        Number(c.req.header("Content-Length") ?? 0) > 0 ||
        c.req.header("Transfer-Encoding") !== undefined
      if (hasBody) {
        const expected =
          bodyTypes.find(
            (rule) => rule.method === c.req.method && rule.path.test(c.req.path)
          )?.types ?? json
        const media = type?.split(";")[0].trim().toLowerCase()
        if (!media || !expected.includes(media)) {
          return refuse("Wrong content type")
        }
      }
    }
    await next()
  })
}
