import { useRef, useState } from "react"
import { newId, type DiveSetKind } from "@shylog/core"
import { IconArrowMerge } from "@tabler/icons-react"
import { useRouter } from "@tanstack/react-router"

import { LeaveGuard, type Leave } from "@/components/leave-guard"
import { countText, nameLimit, tidyName } from "@/components/pickers/match"
import { BarButton } from "@/components/pickers/sheet"
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
import { Refused } from "@/data/edits"
import {
  changesOf,
  failureText,
  pickedOf,
  setEntityDives,
  type Entity,
  type Picked,
} from "@/data/entities"
import type { LogView } from "@/data/log"
import { Label, Row, RowInput, Section } from "@/dive/form/rows"
import { useDesk } from "@/hooks/use-desk"
import { useHoldUpdate } from "@/update"

import { PageBar } from "./bar"
import { DivePicker } from "./dive-picker"
import { ChooseDivesRow, DivesCard } from "./dives-card"
import { OfflineMark } from "@/components/offline-mark"
import { useConnected } from "@/data/sync-status"
import { kindLabels } from "./kinds"

// A new trip, dive centre or person, made from You with its dives, so it
// is never saved with none: Save waits for a name and a dive, and sends
// both in one request.
export function NewEntity({ log, kind }: { log: LogView; kind: DiveSetKind }) {
  const router = useRouter()
  const desk = useDesk()
  const label = kindLabels[kind]
  const [id] = useState(() => newId(kind))
  const [name, setName] = useState("")
  const [ticked, setTicked] = useState<Picked>(new Map())
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [nameError, setNameError] = useState<string>()
  const [conflict, setConflict] = useState<Entity>()
  // Set once saved, so LeaveGuard lets the screen go.
  const leaving = useRef(false)
  const [leave, setLeave] = useState<Leave | null>(null)
  // It is saved with its dives in one request, so it waits for the server.
  const connected = useConnected()
  const ready = !!tidyName(name) && ticked.size > 0 && !busy && connected
  const dives = log.dives.filter((dive) => ticked.has(dive.id))
  useHoldUpdate(!!name.trim() || ticked.size > 0)

  // The saved one takes this screen's place, as a finished step does.
  const open = (to: string) => {
    leaving.current = true
    void router.navigate({
      to: "/you/entities/$kind/$id",
      params: { kind, id: to },
      state: router.state.location.state,
      replace: true,
    })
  }

  const save = async () => {
    if (!ready) return
    setBusy(true)
    setError(undefined)
    try {
      await setEntityDives(kind, id, {
        create: { name: tidyName(name) },
        ...changesOf(kind, new Map(), ticked),
      })
      open(id)
    } catch (failure) {
      const other =
        failure instanceof Refused
          ? (failure.details.conflict as Entity | undefined)
          : undefined
      const message = failureText(log, failure)
      if (other) {
        setNameError(message)
        setConflict(other)
      } else setError(message)
      setBusy(false)
    }
  }

  // The name is taken: the ticked dives go to the one holding it instead.
  // Dives it already has keep their role there, and when it has them all
  // there is nothing to send.
  const addToExisting = async () => {
    if (!conflict) return
    setBusy(true)
    try {
      const before = pickedOf(log, kind, conflict.id)
      const changes = changesOf(kind, before, new Map([...ticked, ...before]))
      if (changes.add?.length) await setEntityDives(kind, conflict.id, changes)
      open(conflict.id)
    } catch (failure) {
      setNameError(failureText(log, failure))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col">
      <PageBar
        back={{ label: label.title, to: "/you/entities", search: { kind } }}
        title={`New ${label.one}`}
        end={
          <>
            <OfflineMark show={!connected} className="mx-1" />
            {desk ? (
              <Button disabled={!ready} onClick={save}>
                Save
              </Button>
            ) : (
              <BarButton strong disabled={!ready} onClick={save}>
                Save
              </BarButton>
            )}
          </>
        }
      />
      <div className="flex flex-col gap-6 px-4 pt-3 pb-10 md:mx-auto md:w-full md:max-w-xl">
        <div>
          <Section title="Details">
            <Row>
              <Label htmlFor="entity-name">Name</Label>
              <RowInput
                id="entity-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setNameError(undefined)
                  setConflict(undefined)
                }}
                maxLength={nameLimit}
                autoCapitalize="words"
                aria-invalid={!!nameError || undefined}
                aria-describedby={nameError ? "error-name" : undefined}
              />
            </Row>
          </Section>
          {nameError && (
            <p
              id="error-name"
              role="alert"
              className="mt-2 px-1 text-[13px] [overflow-wrap:anywhere] text-destructive"
            >
              {nameError}
            </p>
          )}
          {nameError && conflict && (
            <Card className="mt-3 gap-0 py-0">
              <button
                type="button"
                disabled={busy}
                onClick={addToExisting}
                className="flex min-h-12 items-center gap-2 px-4 text-left text-[15px] font-medium text-primary transition-colors duration-150 select-none enabled:hover:bg-muted/60 enabled:active:bg-muted enabled:active:duration-0 disabled:text-muted-foreground/60"
              >
                <IconArrowMerge aria-hidden className="size-[1.15em]" />
                <span className="[overflow-wrap:anywhere]">
                  Add these dives to {conflict.name}
                </span>
              </button>
            </Card>
          )}
          {error && (
            <p role="alert" className="mt-2 px-1 text-[13px] text-destructive">
              {error}
            </p>
          )}
        </div>

        <section aria-labelledby="entity-dives">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2
              id="entity-dives"
              className="text-[13px] font-semibold text-muted-foreground"
            >
              Dives
            </h2>
            {dives.length > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {countText(dives.length)}
              </span>
            )}
          </div>
          <DivesCard dives={dives} kind={kind} log={log}>
            <ChooseDivesRow onClick={() => setPicking(true)} />
          </DivesCard>
        </section>
      </div>

      <DivePicker
        open={picking}
        onOpenChange={setPicking}
        log={log}
        kind={kind}
        entityId={null}
        name={tidyName(name)}
        picked={ticked}
        action="Done"
        onConfirm={(next) => {
          // Nothing is saved yet, so the form just takes the ticks.
          setTicked(next)
          setError(undefined)
        }}
      />

      {desk && (
        <>
          <LeaveGuard
            when={() => !leaving.current && (!!name.trim() || ticked.size > 0)}
            onBlock={setLeave}
          />
          <Drawer
            open={leave != null}
            onOpenChange={(next) => {
              if (next) return
              leave?.reset()
              setLeave(null)
            }}
          >
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Discard changes?</DrawerTitle>
                <DrawerDescription>
                  This new {label.one} hasn’t been saved.
                </DrawerDescription>
              </DrawerHeader>
              <DrawerFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    leave?.reset()
                    setLeave(null)
                  }}
                >
                  Keep editing
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setLeave(null)
                    leave?.proceed()
                  }}
                >
                  Discard changes
                </Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </>
      )}
    </div>
  )
}
