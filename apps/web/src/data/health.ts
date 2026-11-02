import { useCallback, useEffect, useState } from "react"
import type { InferResponseType } from "hono/client"

import { apiClient } from "@/api/client"

export type Health = InferResponseType<
  ReturnType<typeof apiClient>["api"]["health"]["$get"],
  200
>

// `/api/health` for the You tab: the server's own dive count and backup
// times, asked again whenever `when` changes (each sync) or `reload` is
// called (after an export). Undefined while it loads or when the server
// can't be reached, so the rows fall back to what the phone knows.
let latest: Health | undefined

export function useHealth(when: string | undefined) {
  // The last answer, so a return to You draws its rows and alerts at once
  // rather than "—" until the server answers again.
  const [health, setHealth] = useState<Health | undefined>(latest)
  const [asked, setAsked] = useState(0)
  useEffect(() => {
    let current = true
    apiClient()
      .api.health.$get()
      .then(async (res) => {
        if (!res.ok) return
        const answer = await res.json()
        latest = answer
        if (current) setHealth(answer)
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [when, asked])
  const reload = useCallback(() => setAsked((n) => n + 1), [])
  return [health, reload] as const
}
