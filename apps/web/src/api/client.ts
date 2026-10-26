import type { AppType } from "@shylog/server/app"
import { hc, type InferResponseType } from "hono/client"

// Every API call carries the header the server's checks require; the
// browser adds the Origin itself. Tests pass their own fetch.
export const apiClient = (fetch?: typeof globalThis.fetch) =>
  hc<AppType>(location.origin, { headers: { "X-Shylog": "1" }, fetch })

export type Log = InferResponseType<
  ReturnType<typeof apiClient>["api"]["log"]["$get"],
  200
>

export type Profile = InferResponseType<
  ReturnType<typeof apiClient>["api"]["dives"][":id"]["samples"]["$get"],
  200
>
