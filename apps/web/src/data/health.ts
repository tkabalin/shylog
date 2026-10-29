import { useEffect, useState } from "react"
import type { InferResponseType } from "hono/client"

import { apiClient } from "@/api/client"

export type Health = InferResponseType<
  ReturnType<typeof apiClient>["api"]["health"]["$get"],
  200
>

// `/api/health` for the You tab: the server's own dive count and backup
// times, asked again whenever `when` changes (each sync). Undefined while it loads or
// when the server can't be reached, so the rows fall back to what the
// phone knows.
export function useHealth(when: string | undefined) {
  const [health, setHealth] = useState<Health>()
  useEffect(() => {
    let current = true
    apiClient()
      .api.health.$get()
      .then(async (res) => {
        if (res.ok && current) setHealth(await res.json())
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [when])
  return health
}
