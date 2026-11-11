import { useEffect, useState } from "react"
import { cn } from "cn"

import {
  forgetComputer,
  loadDiveComputer,
  useDiveComputer,
} from "@/data/dive-computer"
import { useConnected } from "@/data/sync-status"
import { computerName } from "@/dive/form/values"
import { instant } from "@/format/dates"
import { ConfirmSheet } from "@/import/sheets"
import { listRow, pressable, RowContent } from "@/you/parts"

// The watch this log downloads from, under You's Dive computer: Forget
// lets a new one be used, as any other is refused (see Downloading from the
// dive computer in the spec).
export function DiveComputerRow() {
  const { computer } = useDiveComputer()
  const connected = useConnected()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (connected) void loadDiveComputer()
  }, [connected])

  if (!computer) return null
  const name = computerName(computer.model)
  const forget = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await forgetComputer()
      setOpen(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
    setBusy(false)
  }
  return (
    <>
      <button
        type="button"
        disabled={!connected}
        onClick={() => setOpen(true)}
        className={cn(listRow, pressable, "disabled:opacity-50")}
      >
        <RowContent
          label={computer.model}
          sub={
            computer.lastDownloadAt
              ? `Last downloaded ${instant(computer.lastDownloadAt)}`
              : "Nothing imported from it yet"
          }
          value={<span className="text-destructive">Forget</span>}
        />
      </button>
      <ConfirmSheet
        open={open}
        onOpenChange={setOpen}
        title={`Forget your ${name}?`}
        body="Import then takes the next dive computer on the cable. Your dives stay as they are."
        confirm="Forget"
        cancel="Keep it"
        destructive
        busy={busy}
        error={error}
        onConfirm={() => void forget()}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
