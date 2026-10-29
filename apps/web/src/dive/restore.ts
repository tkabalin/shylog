import { toast } from "sonner"

import { restoreDive } from "@/data/edits"

// Back into the log from Recently deleted or the deleted dive's page, with
// the board's toast; `view` adds its link to the dive where the page isn't
// already showing it. A failure says why in the same place. True once the
// dive is back.
export async function restore(
  diveId: string,
  site: string | undefined,
  view?: () => void
) {
  try {
    await restoreDive(diveId)
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error))
    return false
  }
  toast(`${site ?? "The dive"} is back in your log`, {
    action: view && { label: "View", onClick: view },
  })
  return true
}
