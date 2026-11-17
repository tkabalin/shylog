import { useRef, useState } from "react"
import {
  IconClockEdit,
  IconMinus,
  IconPlugConnected,
  IconPlus,
  IconSelector,
} from "@tabler/icons-react"
import type { ImportPreview } from "@shylog/core"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { currentImport, setDayOffset, useImport } from "@/data/import"
import { pressedButton, SelectRow } from "@/dive/form/rows"
import { longDate } from "@/format/dates"
import { useDesk } from "@/hooks/use-desk"

import { bigButton } from "./parts"
import {
  capital,
  clockDay,
  offsetText,
  stepOffset,
  type Overrides,
} from "./review"

interface Wanted {
  date: string
  offset: number
}

// ImportReviewHifi's clock sheet: one day's offset in 15-minute steps, sent
// as it changes so the pair line follows, with a reset to the estimate.
export function ClockSheet({
  open,
  onOpenChange,
  date,
  onDateChange,
  computer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  date: string | null
  onDateChange: (date: string) => void
  // "D4i", or "dive computer" when the export names none.
  computer: string
}) {
  const desk = useDesk()
  const { preview, overrides } = useImport()
  // The offset the diver asked for while the server catches up, so taps
  // count at once and are sent one at a time, the last one winning. It
  // keeps its day, and the day can't change until it lands.
  const [wanted, setWanted] = useState<Wanted | null>(null)
  const target = useRef<Wanted | null>(null)
  const sending = useRef(false)
  const [error, setError] = useState<string>()

  const day = preview?.days.find((found) => found.date === date)
  if (!preview || !day || !date) return null
  const offset = wanted?.date === date ? wanted.offset : day.offset

  const send = async () => {
    if (sending.current) return
    sending.current = true
    try {
      for (;;) {
        const want = target.current
        const now = currentImport().preview?.days.find(
          (found) => found.date === want?.date
        )
        if (!want || !now || want.offset === now.offset) break
        await setDayOffset(
          want.date,
          want.offset === now.estimatedOffset ? null : want.offset
        )
      }
      setError(undefined)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      sending.current = false
      target.current = null
      setWanted(null)
    }
  }
  const move = (next: number) => {
    target.current = { date, offset: next }
    setWanted(target.current)
    void send()
  }

  const title = `${capital(computer)} clock`

  return (
    <Drawer showSwipeHandle open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="pb-4">
          <DrawerTitle className="inline-flex items-center justify-center gap-1.5 desk:justify-start">
            {/* 18 px, so it centres in the title's 24 px line on a whole
                pixel rather than shifting as the sheet's transition ends. */}
            <IconClockEdit
              aria-hidden
              className="size-4.5 shrink-0 text-muted-foreground"
            />
            {title}
          </DrawerTitle>
          <DrawerDescription>
            Shift its times on one day so they line up with your log. Other days
            don’t change.
          </DrawerDescription>
        </DrawerHeader>
        {/* Inside the content, which mounts only while the sheet is open,
            so a closed sheet works out none of its days or pairs on every
            tap behind it. */}
        <ClockBody
          preview={preview}
          overrides={overrides}
          date={date}
          day={day}
          offset={offset}
          wanted={wanted}
          error={error}
          title={title}
          desk={desk}
          move={move}
          onDateChange={onDateChange}
        />
        <DrawerFooter className="pt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            className={desk ? undefined : bigButton}
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function ClockBody({
  preview,
  overrides,
  date,
  day,
  offset,
  wanted,
  error,
  title,
  desk,
  move,
  onDateChange,
}: {
  preview: ImportPreview
  overrides: Overrides
  date: string
  day: ImportPreview["days"][number]
  offset: number
  wanted: Wanted | null
  error: string | undefined
  title: string
  desk: boolean
  move: (offset: number) => void
  onDateChange: (date: string) => void
}) {
  const line = clockDay(preview, overrides, date)
  // Newest first, as every list of days and dives runs.
  const days = preview.days.toReversed().map((found) => ({
    value: found.date,
    label: `${longDate(found.date)}${found.offset ? ` · ${offsetText(found.offset)}` : ""}`,
  }))
  return (
    <div className="flex flex-col gap-5 px-4">
      {desk ? (
        <Card className="gap-0 py-0">
          <SelectRow
            label="Day"
            value={date}
            options={days}
            optional={false}
            onChange={(next) => next && !wanted && onDateChange(next)}
          />
        </Card>
      ) : (
        // The board's native picker over the row, as iOS wheels suit a
        // short list of days.
        <Card className="relative min-h-12 flex-row items-center gap-3 py-0 pr-3 pl-4 text-[15px] tabular-nums">
          <span className="flex-1 text-muted-foreground">Day</span>
          <span aria-hidden className="font-medium">
            {longDate(date)}
          </span>
          <IconSelector
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground/60"
          />
          <select
            aria-label="Day"
            value={date}
            disabled={!!wanted}
            onChange={(event) => onDateChange(event.target.value)}
            // Unseen, but 16px, so iOS never zooms in on focus even without
            // the app's zoom lock.
            className="absolute inset-0 size-full cursor-pointer text-base opacity-0"
          >
            {days.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Card>
      )}
      <div
        role="group"
        aria-label={`${title} offset ${offsetText(offset)}`}
        className="flex items-center justify-center gap-5"
      >
        <button
          type="button"
          aria-label="Back 15 minutes"
          disabled={offset <= -840}
          onClick={() => move(stepOffset(offset, -1))}
          className={cn(
            "inline-flex size-11 items-center justify-center rounded-full bg-muted disabled:opacity-40",
            pressedButton
          )}
        >
          <IconMinus aria-hidden className="size-5" />
        </button>
        <span className="min-w-24 text-center text-[32px] leading-10 font-semibold tracking-[-0.03em] tabular-nums">
          {offsetText(offset)}
        </span>
        <button
          type="button"
          aria-label="Forward 15 minutes"
          disabled={offset >= 840}
          onClick={() => move(stepOffset(offset, 1))}
          className={cn(
            "inline-flex size-11 items-center justify-center rounded-full bg-muted disabled:opacity-40",
            pressedButton
          )}
        >
          <IconPlus aria-hidden className="size-5" />
        </button>
      </div>
      <Card className="min-h-12 flex-row items-center gap-2.5 px-4 py-3 text-sm tabular-nums">
        <span
          role="status"
          className={cn(
            "flex flex-1 items-center gap-1.5",
            !line.allPaired && "text-warn"
          )}
        >
          <IconPlugConnected aria-hidden className="size-[1.15em] shrink-0" />
          {wanted == null ? line.pairLine : "Pairing again…"}
        </span>
        {line.reset && wanted == null && (
          <button
            type="button"
            onClick={() => move(day.estimatedOffset)}
            className={cn(
              "relative shrink-0 text-sm font-medium text-primary after:absolute after:-inset-3",
              pressedButton
            )}
          >
            {line.reset}
          </button>
        )}
      </Card>
      {error && (
        <p role="alert" className="text-center text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
