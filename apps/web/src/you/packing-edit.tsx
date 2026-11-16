import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react"
import { createPortal, flushSync } from "react-dom"
import {
  dropUnwritable,
  newId,
  packingMaxItems,
  packingMaxSections,
  type Id,
  type Packing,
} from "@shylog/core"
import { IconCircleMinus, IconCirclePlus, IconEqual } from "@tabler/icons-react"
import {
  animate,
  AnimatePresence,
  motion,
  MotionConfig,
  useMotionValue,
  useReducedMotion,
  type AnimationPlaybackControls,
} from "motion/react"
import { cn } from "cn"

import { DiscardSheet } from "@/components/discard-sheet"
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
import { OfflineMark } from "@/components/offline-mark"
import { savePacking } from "@/data/packing"
import { useConnected } from "@/data/sync-status"
import { ErrorLine } from "@/dive/form/rows"
import { useDesk } from "@/hooks/use-desk"
import { isReturn } from "@/lib/keys"
import { useHoldUpdate } from "@/update"

import { PageBar } from "./bar"
import { SaveFailure } from "./parts"

interface Row {
  id: string
  name: string
}
interface Section extends Row {
  items: Row[]
}
type Kind = "item" | "section"

// What the rows do, the same functions for the screen's life, so a row
// left unchanged by an edit isn't drawn again.
interface Actions {
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  add: (sectionId?: string) => void
  grab: (kind: Kind, id: string, event: ReactPointerEvent) => void
  // A ref callback's, returning its cleanup (React 19), so a row fading out
  // can't drop the node its twin in another section has just registered.
  register: (key: string, node: HTMLElement) => () => void
  registerInput: (id: string, node: HTMLInputElement) => () => void
}

// What a finger drags keeps up with it: neighbours make room, and the drop
// settles, with a critically damped spring this short (motion.md).
const spring = { type: "spring", visualDuration: 0.12, bounce: 0 } as const
// A deleted row fades, on the list's spring, while the rest close up.
const exit = { opacity: 0 }

// How far into the visible list a drag starts scrolling it, and how fast
// at the very edge or over a bar, in pixels a frame at 60 Hz.
const edge = 64
const fastest = 14
// The room left between a card brought into view and the keyboard.
const keyboardGap = 16

// The list as Done saves it, names tidied and stripped as the server strips
// them, and the rows left blank, which stop Done until they are named. The
// list leaves them out, so a blank row alone isn't a change to ask about.
function tidied(sections: Section[]) {
  const blank: string[] = []
  const kept: Packing["sections"] = []
  for (const section of sections) {
    const name = tidyName(dropUnwritable(section.name))
    if (!name) blank.push(section.id)
    const items: Packing["sections"][number]["items"] = []
    for (const item of section.items) {
      const named = tidyName(dropUnwritable(item.name))
      if (named) items.push({ id: item.id as Id<"packingItem">, name: named })
      else blank.push(item.id)
    }
    if (name) kept.push({ id: section.id as Id<"packingSection">, name, items })
  }
  return { packing: { sections: kept }, blank }
}

// What a section's error line asks for, from its rows Done found blank.
function blankError(section: Section, flagged: string[]) {
  const nameless = flagged.includes(section.id)
  const items = section.items.filter((item) => flagged.includes(item.id))
  if (nameless)
    return items.length
      ? "Name this section and its items"
      : "Name this section"
  if (items.length)
    return items.length === 1 ? "Name this item" : "Name these items"
}

const rowsOf = (packing: Packing): Section[] =>
  packing.sections.map((section) => ({ ...section, items: [...section.items] }))

// Keeps the key in the map for as long as this node holds it.
const keep =
  <T,>(map: Map<string, T>) =>
  (key: string, node: T) => {
    map.set(key, node)
    return () => {
      if (map.get(key) === node) map.delete(key)
    }
  }

// Edit mode: every section and item a field to rename, with a delete and a
// grip to drag it, an item into any section and a heading with its whole
// section. Nothing is saved until Done sends the list whole.
export function EditList({
  packing,
  back,
  onClose,
}: {
  packing: Packing
  back: ComponentProps<typeof PageBar>["back"]
  onClose: () => void
}) {
  const desk = useDesk()
  const connected = useConnected()
  const reduce = useReducedMotion()
  // The list as Edit opened it, which Done compares with: a sync's newer
  // list mustn't read as an edit, or Done would put the old one back.
  const [opened, setOpened] = useState(packing)
  const [sections, setSections] = useState(() => rowsOf(packing))
  // The list as last set, which a drag reads between renders.
  const latest = useRef(sections)
  useLayoutEffect(() => {
    latest.current = sections
  }, [sections])
  const update = (next: Section[]) => {
    latest.current = next
    setSections(next)
  }
  // Until something is touched, a sync's newer list replaces the one shown.
  const touched = useMemo(
    () => JSON.stringify(sections) !== JSON.stringify(opened.sections),
    [sections, opened]
  )
  if (!touched && JSON.stringify(packing) !== JSON.stringify(opened)) {
    setOpened(packing)
    setSections(rowsOf(packing))
  }
  // The rows Done found blank, flagged until they are named or deleted.
  const [blank, setBlank] = useState<string[]>([])
  const [failure, setFailure] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [leave, setLeave] = useState<Leave | null>(null)
  // The answers when leaving with changes asks first.
  const keepEditing = () => {
    leave?.reset()
    setLeave(null)
  }
  const discardEdits = () => {
    setLeave(null)
    leave?.proceed()
  }
  // As Done would save it, so a blank row left behind doesn't ask first.
  const changed = useMemo(
    () => JSON.stringify(tidied(sections).packing) !== JSON.stringify(opened),
    [sections, opened]
  )
  useHoldUpdate(changed)

  const inputs = useRef(new Map<string, HTMLInputElement>())
  const nodes = useRef(new Map<string, HTMLElement>())
  // A frame later, once Motion has measured the new layout: it can't see the
  // list's scroller, so a scroll before that would read as every row moving.
  const later = (scroll: () => void) => requestAnimationFrame(scroll)
  // The browser's own smooth scroll, which WebKit runs off the main thread
  // as a native list's, so it stays smooth while the rows slide and the
  // keyboard rises; a finger or a later scroll takes over from it.
  const glide = (scroller: HTMLElement, by: number) =>
    scroller.scrollTo({
      top: scroller.scrollTop + by,
      behavior: reduce ? "instant" : "smooth",
    })
  // To where the card is laid out, not to its box still growing from the
  // old size, which would leave its foot under the tabs. A card just added
  // to shows its foot, where the new field and Add item are, and never
  // scrolls back up to its heading; otherwise as scrollIntoView's nearest.
  // Its foot stays clear of the tabs, and of the keyboard while it is up.
  const reveal = (sectionId: string, foot = false) =>
    later(() => {
      const node = nodes.current.get(`block:${sectionId}`)
      const scroller = document.getElementById("main")
      if (!node || !scroller) return
      const margins = getComputedStyle(node)
      const box = scroller.getBoundingClientRect()
      const view = window.visualViewport
      const floor = Math.min(
        box.bottom - parseFloat(margins.scrollMarginBottom),
        view ? view.offsetTop + view.height - keyboardGap : Infinity
      )
      const top =
        naturalTop(node) - parseFloat(margins.scrollMarginTop) - box.top
      const bottom = naturalTop(node) + node.offsetHeight - floor
      if (foot) {
        if (bottom > 0) glide(scroller, bottom)
      } else if (top < 0) glide(scroller, top)
      else if (bottom > 0) glide(scroller, Math.min(top, bottom))
    })

  // Only the sections an edit touches are copied, so the others keep
  // their identity and their cards aren't drawn again.
  const rename = (id: string, name: string) => {
    setBlank((was) =>
      was.includes(id) ? was.filter((other) => other !== id) : was
    )
    update(
      latest.current.map((section) =>
        section.id === id
          ? { ...section, name }
          : section.items.some((item) => item.id === id)
            ? {
                ...section,
                items: section.items.map((item) =>
                  item.id === id ? { ...item, name } : item
                ),
              }
            : section
      )
    )
  }
  const drop = (id: string) => {
    const next = latest.current
      .filter((section) => section.id !== id)
      .map((section) =>
        section.items.some((item) => item.id === id)
          ? {
              ...section,
              items: section.items.filter((item) => item.id !== id),
            }
          : section
      )
    // A deleted row, and those of a deleted section, no longer need a name.
    const still = tidied(next).blank
    setBlank((was) => was.filter((other) => still.includes(other)))
    update(next)
  }
  // A section with items asks first, as its items go with it; a row or an
  // empty section goes at once.
  const [doomed, setDoomed] = useState<Section>()
  const [asking, setAsking] = useState(false)
  const remove = (id: string) => {
    const section = latest.current.find((at) => at.id === id)
    if (!section?.items.length) return drop(id)
    setDoomed(section)
    setAsking(true)
  }
  // Rendered within the tap, so its field takes focus while iOS still lets
  // a focus bring up the keyboard.
  const add = (sectionId?: string) => {
    const id = sectionId ? newId("packingItem") : newId("packingSection")
    flushSync(() =>
      update(
        sectionId
          ? latest.current.map((section) =>
              section.id === sectionId
                ? { ...section, items: [...section.items, { id, name: "" }] }
                : section
            )
          : [...latest.current, { id, name: "", items: [] }]
      )
    )
    // The new field and the Add item under it in view, not only the field.
    // On a phone with the keyboard down, it is about to rise: one scroll
    // once it is up rather than one now and another as it lands, unless
    // none comes (a hardware keyboard).
    const section = sectionId ?? id
    added.current = { section, field: id }
    clearTimeout(waiting.current)
    if (keyboard || !matchMedia("(pointer: coarse)").matches)
      reveal(section, true)
    else waiting.current = window.setTimeout(() => reveal(section, true), 600)
    inputs.current.get(id)?.focus({ preventScroll: true })
  }
  // The keyboard shrinks only the visual viewport: once it has settled, a
  // field just added has its card brought clear of it, and the list's end
  // is padded by its height so the last card can rise.
  const added = useRef<{ section: string; field: string } | null>(null)
  const waiting = useRef(0)
  const [keyboard, setKeyboard] = useState(0)
  const fit = useRef<() => void>(null)
  useLayoutEffect(() => {
    fit.current = () => {
      const view = window.visualViewport!
      const covered = innerHeight - view.offsetTop - view.height
      // A desktop scrollbar shrinks it a little too, with no keyboard.
      flushSync(() => setKeyboard(covered > 100 ? Math.round(covered) : 0))
      const just = added.current
      if (just && document.activeElement === inputs.current.get(just.field)) {
        clearTimeout(waiting.current)
        reveal(just.section, true)
      }
    }
  })
  useEffect(() => {
    const view = window.visualViewport
    if (!view) return
    // iOS may report the keyboard more than once as it rises.
    let settle = 0
    const resize = () => {
      clearTimeout(settle)
      settle = window.setTimeout(() => fit.current?.(), 80)
    }
    view.addEventListener("resize", resize)
    return () => {
      clearTimeout(settle)
      view.removeEventListener("resize", resize)
    }
  }, [])

  const done = async () => {
    if (busy) return
    const tidy = tidied(latest.current)
    if (tidy.blank.length) {
      const [first] = tidy.blank
      flushSync(() => setBlank(tidy.blank))
      // Its card brought into view with the error under it, which the
      // field's own focus would leave below the tabs.
      const section = latest.current.find(
        (at) => at.id === first || at.items.some((item) => item.id === first)
      )
      if (section) reveal(section.id)
      inputs.current.get(first)?.focus({ preventScroll: true })
      return
    }
    if (JSON.stringify(tidy.packing) === JSON.stringify(opened)) {
      onClose()
      return
    }
    setBusy(true)
    setFailure(undefined)
    try {
      await savePacking(tidy.packing)
      onClose()
    } catch (error) {
      flushSync(() => {
        setFailure(error instanceof Error ? error.message : String(error))
        setBusy(false)
      })
      // It shows at the top of the list, which may be scrolled away.
      later(() => document.getElementById("main")?.scrollTo({ top: 0 }))
    }
  }

  // The drag: a copy of the row follows the finger over the list while the
  // row itself, hidden, moves to where it would drop.
  const container = useRef<HTMLDivElement>(null)
  const y = useMotionValue(0)
  const [drag, setDrag] = useState<{
    kind: Kind
    id: string
    left: number
    width: number
    // Settling into place after the finger has let go.
    dropping?: boolean
  } | null>(null)
  const dragging = useRef<{
    kind: Kind
    id: string
    offset: number
    height: number
  } | null>(null)
  const settling = useRef<AnimationPlaybackControls | null>(null)
  const pointer = useRef(0)

  // Where a row sits once laid out, in the viewport: offsets, which leave
  // out the transforms of rows still sliding into place.
  const naturalTop = (
    node: HTMLElement,
    base = container.current!.getBoundingClientRect().top
  ) => {
    let top = 0
    for (
      let at: HTMLElement | null = node;
      at && at !== container.current;
      at = at.offsetParent as HTMLElement | null
    )
      top += at.offsetTop
    return base + top
  }
  // The list's top, read once per step rather than once per row measured.
  const listTop = useRef(0)
  const middle = (key: string) => {
    const node = nodes.current.get(key)
    return node
      ? naturalTop(node, listTop.current) + node.offsetHeight / 2
      : null
  }

  // One move of the hidden row towards the copy: past a neighbour's middle
  // by the copy's top going up or its bottom going down, which can't swing
  // back, and past a heading's middle into the next section.
  const step = (kind: Kind, id: string, top: number, bottom: number) => {
    const list = latest.current
    listTop.current = container.current!.getBoundingClientRect().top
    const above = (key: string) => {
      const at = middle(key)
      return at != null && top < at
    }
    const below = (key: string) => {
      const at = middle(key)
      return at != null && bottom > at
    }
    let next: Section[] | null = null
    if (kind === "section") {
      const i = list.findIndex((section) => section.id === id)
      if (i < 0) return false
      const to =
        i > 0 && above(`block:${list[i - 1].id}`)
          ? i - 1
          : i < list.length - 1 && below(`block:${list[i + 1].id}`)
            ? i + 1
            : i
      if (to !== i) {
        next = [...list]
        next.splice(to, 0, ...next.splice(i, 1))
      }
    } else {
      const s = list.findIndex((section) =>
        section.items.some((item) => item.id === id)
      )
      if (s < 0) return false
      const { items } = list[s]
      const i = items.findIndex((item) => item.id === id)
      const up: [number, number] | null =
        i > 0
          ? above(`item:${items[i - 1].id}`)
            ? [s, i - 1]
            : null
          : s > 0 && above(`head:${list[s].id}`)
            ? [s - 1, list[s - 1].items.length]
            : null
      const down: [number, number] | null =
        i < items.length - 1
          ? below(`item:${items[i + 1].id}`)
            ? [s, i + 1]
            : null
          : s < list.length - 1 && below(`head:${list[s + 1].id}`)
            ? [s + 1, 0]
            : null
      const to = up ?? down
      if (to) {
        const item = items[i]
        next = [...list]
        next[s] = { ...list[s], items: items.filter((_, n) => n !== i) }
        const into = next[to[0]]
        next[to[0]] = {
          ...into,
          items: [
            ...into.items.slice(0, to[1]),
            item,
            ...into.items.slice(to[1]),
          ],
        }
      }
    }
    if (!next) return false
    const moved = next
    // Laid out at once, so the next step measures the new places.
    flushSync(() => update(moved))
    return true
  }

  const follow = () => {
    const held = dragging.current
    if (!held) return
    const top = pointer.current - held.offset
    y.set(top)
    // A fast finger can pass several rows between two moves.
    for (let n = 0; n < 50; n++) {
      if (!step(held.kind, held.id, top, top + held.height)) break
    }
  }

  // Captured by the list, which never remounts, as the grip that began the
  // drag may: an item crossing into another section is drawn anew there.
  useEffect(() => {
    if (!drag || drag.dropping || dragging.current?.id !== drag.id) return
    const list = container.current!
    const scroller = document.getElementById("main")
    let frame = 0
    let last = performance.now()
    // The visible list's edges, under the bar and above the tabs, which a
    // drag doesn't move, read once rather than each frame.
    const box = scroller?.getBoundingClientRect()
    const bar = scroller?.querySelector("header")?.getBoundingClientRect()
    const top = bar ? bar.bottom : (box?.top ?? 0)
    const bottom = box
      ? box.bottom - parseFloat(getComputedStyle(scroller!).paddingBottom)
      : innerHeight
    // What a frame's scroll leaves over a whole pixel, which WebKit would
    // round away, stalling the slow edge of the zone.
    let carry = 0
    // Near those edges the list scrolls under the finger, faster the
    // nearer it is, at the same speed whatever the refresh rate.
    const scroll = (now: number) => {
      const frames = Math.min(now - last, 32) / (1000 / 60)
      last = now
      const from = pointer.current - top
      const to = bottom - pointer.current
      const speed =
        from < edge
          ? -fastest * Math.min(1, 1 - from / edge)
          : to < edge
            ? fastest * Math.min(1, 1 - to / edge)
            : 0
      if (scroller && speed) {
        carry += speed * frames
        const whole = Math.trunc(carry)
        carry -= whole
        if (whole) {
          scroller.scrollTop += whole
          follow()
        }
      }
      frame = requestAnimationFrame(scroll)
    }
    frame = requestAnimationFrame(scroll)
    const move = (event: PointerEvent) => {
      pointer.current = event.clientY
      follow()
    }
    const drop = () => {
      const held = dragging.current
      dragging.current = null
      cancelAnimationFrame(frame)
      if (!held) return
      const node = nodes.current.get(
        held.kind === "item" ? `item:${held.id}` : `block:${held.id}`
      )
      if (!node || reduce) {
        setDrag(null)
        return
      }
      // The copy lowers as it settles, then gives way to the row.
      setDrag((was) => was && { ...was, dropping: true })
      const settle = animate(y, naturalTop(node), spring)
      settling.current = settle
      void settle.then(() => {
        if (settling.current !== settle) return
        settling.current = null
        setDrag((was) => (was?.id === held.id && was.dropping ? null : was))
      })
    }
    list.addEventListener("pointermove", move)
    list.addEventListener("pointerup", drop)
    list.addEventListener("pointercancel", drop)
    list.addEventListener("lostpointercapture", drop)
    return () => {
      cancelAnimationFrame(frame)
      list.removeEventListener("pointermove", move)
      list.removeEventListener("pointerup", drop)
      list.removeEventListener("pointercancel", drop)
      list.removeEventListener("lostpointercapture", drop)
    }
    // Once per drag: the handlers read the latest list through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id, drag?.dropping])

  // A grip lifts its row at once, as the certifications list's does, and
  // takes the touch from the scroller (it is touch-action: none). A row
  // still settling from the last drop gives way at once.
  const grab = (kind: Kind, id: string, event: ReactPointerEvent) => {
    if (event.button !== 0 || dragging.current) return
    event.preventDefault()
    if (settling.current) {
      settling.current.stop()
      settling.current = null
      flushSync(() => setDrag(null))
    }
    // The keyboard would otherwise stay up over the list being dragged.
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur()
    const node = nodes.current.get(
      kind === "item" ? `item:${id}` : `block:${id}`
    )
    if (!node) return
    container.current!.setPointerCapture(event.pointerId)
    const box = node.getBoundingClientRect()
    pointer.current = event.clientY
    y.set(box.top)
    dragging.current = {
      kind,
      id,
      offset: event.clientY - box.top,
      height: box.height,
    }
    setDrag({ kind, id, left: box.left, width: box.width })
  }

  // Each render's handlers, read by the stable ones the rows hold, which
  // only events call, after this has run.
  const current =
    useRef<Pick<Actions, "rename" | "remove" | "add" | "grab">>(null)
  useLayoutEffect(() => {
    current.current = { rename, remove, add, grab }
  })
  const [actions] = useState<Actions>(() => ({
    rename: (...args) => current.current!.rename(...args),
    remove: (...args) => current.current!.remove(...args),
    add: (...args) => current.current!.add(...args),
    grab: (...args) => current.current!.grab(...args),
    // Attached before any effect runs, so they write to the maps directly.
    register: (key, node) => keep(nodes.current)(key, node),
    registerInput: (id, node) => keep(inputs.current)(id, node),
  }))

  // At the server's caps, so a list it would refuse can't be built.
  const itemsFull =
    sections.reduce((sum, section) => sum + section.items.length, 0) >=
    packingMaxItems
  const sectionsFull = sections.length >= packingMaxSections
  // Where each section sits: its place, the items and error lines above
  // it, and the save failure at the top. Motion measures a node only when
  // its own place (or its section's size) changes, so a swap measures the
  // rows it moves, not the whole list, and typing measures nothing.
  const places: string[] = []
  let above = 0
  let flagged = 0
  // Each section's error line, if Done found one of its rows blank.
  const errors = sections.map((section) => blankError(section, blank))
  sections.forEach((section, i) => {
    places.push(`${i}:${above}:${flagged}:${failure ?? ""}`)
    above += section.items.length
    if (errors[i]) flagged++
  })
  const addPlace = `${sections.length}:${above}:${flagged}:${failure ?? ""}`
  const lifted = drag
    ? drag.kind === "section"
      ? sections.find((section) => section.id === drag.id)
      : sections
          .flatMap((section) => section.items)
          .find((item) => item.id === drag.id)
    : undefined
  // The row the copy shows keeps its identity through the swaps, so the
  // copy is drawn once per lift, not again at every swap.
  const liftedKind = drag?.kind
  const copy = useMemo(
    () =>
      !lifted ? null : liftedKind === "section" ? (
        <SectionCard section={lifted as Section} still />
      ) : (
        <Card className="gap-0 py-0">
          <EditRow id={lifted.id} kind="item" value={lifted.name} still />
        </Card>
      ),
    [lifted, liftedKind]
  )

  // Not while Done saves, or the edited list would land after Cancel had
  // shown the old one.
  const close = () => {
    if (!busy) onClose()
  }
  const cancel = desk ? (
    <Button variant="outline" aria-disabled={busy} onClick={close}>
      Cancel
    </Button>
  ) : (
    <BarButton aria-disabled={busy} onClick={close}>
      Cancel
    </BarButton>
  )
  const doneButton = desk ? (
    <Button
      disabled={!connected}
      aria-disabled={busy}
      onClick={() => void done()}
    >
      Done
    </Button>
  ) : (
    <BarButton
      strong
      disabled={!connected}
      aria-disabled={busy}
      onClick={() => void done()}
    >
      Done
    </BarButton>
  )

  return (
    <div className="flex min-h-full flex-col">
      <PageBar
        back={back}
        title="Edit list"
        crumb="Packing list"
        start={desk ? undefined : cancel}
        end={
          <>
            <OfflineMark show={!connected} className="mx-1" />
            {desk && cancel}
            {doneButton}
          </>
        }
      />
      <MotionConfig reducedMotion="user" transition={spring}>
        <div
          ref={container}
          style={{
            paddingBottom: keyboard
              ? `calc(2.5rem + ${keyboard}px)`
              : undefined,
          }}
          className="relative flex flex-col gap-4 px-4 pt-2 pb-10 md:mx-auto md:w-full md:max-w-xl"
        >
          {failure && <SaveFailure error={failure} />}
          <AnimatePresence initial={false} mode="popLayout">
            {sections.map((section, i) => (
              <SectionBlock
                key={section.id}
                section={section}
                place={places[i]}
                hidden={drag?.kind === "section" && drag.id === section.id}
                heldItem={
                  drag?.kind === "item" &&
                  section.items.some((item) => item.id === drag.id)
                    ? drag.id
                    : undefined
                }
                error={errors[i]}
                flagged={blank
                  .filter(
                    (id) =>
                      id === section.id ||
                      section.items.some((item) => item.id === id)
                  )
                  .join(" ")}
                full={itemsFull}
                actions={actions}
              />
            ))}
          </AnimatePresence>
          <motion.div layout="position" layoutDependency={addPlace}>
            <Card className="gap-0 py-0">
              <AddRow
                label="Add section"
                disabled={sectionsFull}
                onClick={() => actions.add()}
              />
            </Card>
          </motion.div>
        </div>
      </MotionConfig>

      {drag &&
        lifted &&
        createPortal(
          // Lifted, it grows a little and its shadow fades in, as a dragged
          // row does on iOS, and both settle back as it drops: scale and
          // opacity only, which the compositor draws.
          <motion.div
            aria-hidden
            style={{ y, left: drag.left, width: drag.width }}
            // Under the bar, as the rows it passes are, and over the tabs;
            // a layer of its own, so following the finger repaints nothing.
            className="pointer-events-none fixed top-0 z-25 will-change-transform"
          >
            <div
              className={cn(
                // A shade lighter in dark, where a shadow barely shows.
                "relative transition-[scale] ease-out motion-reduce:scale-100 dark:*:data-[slot=card]:bg-muted",
                drag.dropping
                  ? "scale-100 duration-[120ms]"
                  : "scale-[1.02] duration-150 starting:scale-100"
              )}
            >
              <div
                className={cn(
                  "absolute inset-0 -z-10 rounded-xl shadow-lg transition-opacity ease-out dark:shadow-black/60",
                  drag.dropping
                    ? "opacity-0 duration-[120ms]"
                    : "duration-150 starting:opacity-0"
                )}
              />
              {copy}
            </div>
          </motion.div>,
          document.body
        )}

      {/* The tabs and the desktop sidebar stay in reach in Edit mode, so
          leaving through them with changes asks first; Cancel drops them. */}
      <LeaveGuard when={() => changed} onBlock={setLeave} />
      <DiscardSheet
        open={leave != null}
        note="Your changes to the packing list will be lost."
        onKeep={keepEditing}
        onDiscard={discardEdits}
      />
      <DeleteSection
        // Kept as it closes, so its words don't empty while it slides away.
        section={doomed}
        open={asking}
        onOpenChange={setAsking}
        onDelete={() => {
          setAsking(false)
          if (doomed) drop(doomed.id)
        }}
      />
    </div>
  )
}

function DeleteSection({
  section,
  open,
  onOpenChange,
  onDelete,
}: {
  section?: Section
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: () => void
}) {
  const desk = useDesk()
  const count = section?.items.length ?? 0
  const body =
    count === 1
      ? "Its item goes with it."
      : `Its ${countText(count)} items go with it.`
  return (
    <Drawer showSwipeHandle open={open} onOpenChange={onOpenChange}>
      {desk ? (
        <DrawerContent role="alertdialog">
          <DrawerHeader>
            <DrawerTitle>Delete this section?</DrawerTitle>
            <DrawerDescription>{body}</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDelete}>
              Delete section
            </Button>
          </DrawerFooter>
        </DrawerContent>
      ) : (
        <DrawerContent role="alertdialog">
          <DrawerHeader className="pb-4">
            <DrawerTitle>Delete this section?</DrawerTitle>
            <DrawerDescription>{body}</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              variant="destructive"
              className="h-12 rounded-[14px] bg-destructive text-base font-semibold text-white hover:bg-destructive/90 dark:bg-red-600 dark:hover:bg-red-600/90"
              onClick={onDelete}
            >
              Delete section
            </Button>
            <Button
              variant="ghost"
              className="h-12 rounded-[14px] text-base font-semibold text-primary"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </DrawerContent>
      )}
    </Drawer>
  )
}

// A section in the list. Laid out whole, size included, so its card grows
// and shrinks with the rows sliding inside it rather than snapping.
const SectionBlock = memo(function SectionBlock({
  ref,
  section,
  place,
  hidden,
  heldItem,
  error,
  flagged,
  full,
  actions,
}: {
  // AnimatePresence's, to take a deleted section out of the flow.
  ref?: Ref<HTMLDivElement>
  section: Section
  place: string
  hidden: boolean
  heldItem?: string
  error?: string
  // The ids of its rows flagged blank, as one string so the memo holds.
  flagged: string
  full: boolean
  actions: Actions
}) {
  // Its place and its size: a row it holds is measured whenever it is, or
  // the row would stretch with the card as it grows.
  const measure = `${place}:${section.items.length}:${error ?? ""}`
  return (
    <motion.div
      ref={(node: HTMLDivElement | null) => {
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
        return node ? actions.register(`block:${section.id}`, node) : undefined
      }}
      layout
      layoutDependency={measure}
      exit={exit}
      // Brought into view clear of the bar above and the tabs below.
      className={cn(
        "scroll-mt-[calc(3.25rem+env(safe-area-inset-top)+0.5rem)] scroll-mb-[calc(--spacing(12.25)+1px+max(0.5rem,env(safe-area-inset-bottom))+1rem)] desk:scroll-mb-4",
        hidden && "invisible"
      )}
    >
      <SectionCard
        section={section}
        place={measure}
        error={error}
        flagged={flagged}
        heldItem={heldItem}
        full={full}
        actions={actions}
      />
    </motion.div>
  )
})

// A section's card: its name as the bold first row, its items, then Add
// item. `still` draws it as the copy a drag carries, with nothing to tap.
function SectionCard({
  section,
  place,
  error,
  flagged = "",
  heldItem,
  full,
  actions,
  still,
}: {
  section: Section
  place?: string
  error?: string
  flagged?: string
  heldItem?: string
  full?: boolean
  actions?: Actions
  still?: boolean
}) {
  const errorId = `error-${section.id}`
  // Each part of the card is laid out, so the block's size animation
  // doesn't stretch it; the copy a drag carries lays out nothing.
  const layout = still ? false : "position"
  const marked = flagged.split(" ")
  return (
    <>
      <Card className="relative gap-0 divide-y py-0">
        <motion.div
          layout={layout}
          layoutDependency={place}
          ref={(node: HTMLDivElement | null) =>
            node && actions
              ? actions.register(`head:${section.id}`, node)
              : undefined
          }
        >
          <EditRow
            id={section.id}
            kind="section"
            value={section.name}
            invalid={marked.includes(section.id)}
            describedBy={error ? errorId : undefined}
            actions={actions}
            still={still}
          />
        </motion.div>
        <AnimatePresence initial={false} mode="popLayout">
          {section.items.map((item, j) => (
            <ItemRow
              key={item.id}
              item={item}
              place={`${place}:${j}`}
              layout={layout}
              hidden={heldItem === item.id}
              invalid={marked.includes(item.id)}
              describedBy={error ? errorId : undefined}
              actions={actions}
              still={still}
            />
          ))}
        </AnimatePresence>
        {/* Opaque, as the item rows are, so it covers a row just added as it
            slides down off it. */}
        <motion.div
          layout={layout}
          layoutDependency={place}
          className={cn(!still && "bg-card")}
        >
          <AddRow
            label="Add item"
            disabled={full}
            onClick={() => actions?.add(section.id)}
            still={still}
          />
        </motion.div>
      </Card>
      {error && (
        <motion.div
          layout={layout}
          layoutDependency={place}
          className="mt-2 px-1"
        >
          <ErrorLine id={errorId} message={error} align="left" />
        </motion.div>
      )}
    </>
  )
}

const ItemRow = memo(function ItemRow({
  ref,
  item,
  place,
  layout,
  hidden,
  invalid,
  describedBy,
  actions,
  still,
}: {
  // AnimatePresence's, to take a deleted item out of the flow.
  ref?: Ref<HTMLDivElement>
  item: Row
  place: string
  layout: false | "position"
  hidden: boolean
  invalid?: boolean
  describedBy?: string
  actions?: Actions
  still?: boolean
}) {
  return (
    <motion.div
      ref={(node: HTMLDivElement | null) => {
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
        return node && actions
          ? actions.register(`item:${item.id}`, node)
          : undefined
      }}
      layout={layout}
      layoutDependency={place}
      exit={exit}
      className={cn(!still && "bg-card", hidden && "invisible")}
    >
      <EditRow
        id={item.id}
        kind="item"
        value={item.name}
        invalid={invalid}
        describedBy={invalid ? describedBy : undefined}
        actions={actions}
        still={still}
      />
    </motion.div>
  )
})

const EditRow = memo(function EditRow({
  id,
  kind,
  value,
  invalid,
  describedBy,
  actions,
  still,
}: {
  id: string
  kind: Kind
  value: string
  invalid?: boolean
  describedBy?: string
  actions?: Actions
  still?: boolean
}) {
  const heading = kind === "section"
  return (
    <div
      className={cn(
        "flex min-h-12 items-center gap-1 pr-1 pl-1.5 desk:min-h-11",
        heading && "bg-muted/60 font-semibold"
      )}
    >
      <button
        type="button"
        aria-label={`Delete ${value || (heading ? "section" : "item")}`}
        tabIndex={still ? -1 : undefined}
        onClick={() => actions?.remove(id)}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-destructive transition-opacity duration-150 hover:opacity-70 active:opacity-50 active:duration-0 desk:size-9"
      >
        <IconCircleMinus aria-hidden className="size-6" />
      </button>
      <input
        ref={(node) =>
          node && actions ? actions.registerInput(id, node) : undefined
        }
        value={value}
        readOnly={still}
        tabIndex={still ? -1 : undefined}
        onChange={(event) => actions?.rename(id, event.target.value)}
        // Return puts the keyboard away, as Done on the keyboard says.
        onKeyDown={(event) => {
          if (isReturn(event)) event.currentTarget.blur()
        }}
        aria-label={heading ? "Section name" : "Item name"}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder={heading ? "Section name" : "Item"}
        enterKeyHint="done"
        autoCapitalize="sentences"
        // iOS reads "Section name" as a person's name and offers to AutoFill
        // a contact; Safari leaves alone a field whose name says search.
        autoComplete="off"
        name={`search-${kind}`}
        maxLength={nameLimit}
        className="h-11 min-w-0 flex-1 bg-transparent text-base tracking-[-0.01em] text-ellipsis outline-none placeholder:font-normal placeholder:text-muted-foreground/70 aria-invalid:placeholder:text-destructive/70 desk:h-9"
      />
      <span
        aria-hidden
        onPointerDown={(event) => actions?.grab(kind, id, event)}
        className="inline-flex size-11 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/70 select-none active:cursor-grabbing desk:size-9"
      >
        <IconEqual className="size-5.5" />
      </span>
    </div>
  )
})

function AddRow({
  label,
  disabled,
  onClick,
  still,
}: {
  label: string
  disabled?: boolean
  onClick?: () => void
  still?: boolean
}) {
  return (
    <button
      type="button"
      tabIndex={still ? -1 : undefined}
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-12 w-full items-center gap-1 pr-3 pl-1.5 text-left text-base font-medium text-primary transition-opacity duration-150 enabled:hover:opacity-70 enabled:active:opacity-50 enabled:active:duration-0 disabled:text-muted-foreground/60 desk:min-h-11"
    >
      <span className="inline-flex size-11 shrink-0 items-center justify-center desk:size-9">
        <IconCirclePlus aria-hidden className="size-6" />
      </span>
      {label}
    </button>
  )
}
