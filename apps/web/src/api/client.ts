import type { AppType } from "@shylog/server/app"
import { uuid } from "@shylog/core"
import { hc, type InferResponseType } from "hono/client"

// Every API call carries the header the server's checks require, and an id
// of its own that the server logs and answers with, so an error here can
// be found in its log. The browser adds the Origin. Tests pass their fetch.
export const apiClient = (fetch?: typeof globalThis.fetch) =>
  hc<AppType>(location.origin, {
    headers: () => ({ "X-Shylog": "1", "X-Request-Id": uuid() }),
    fetch,
  })

export type Log = InferResponseType<
  ReturnType<typeof apiClient>["api"]["log"]["$get"],
  200
>

export type Profile = InferResponseType<
  ReturnType<typeof apiClient>["api"]["dives"][":id"]["samples"]["$get"],
  200
>
