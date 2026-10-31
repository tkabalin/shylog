import { act, useEffect } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { readForm, writeForm } from "@/data/autosave"
import { queue } from "@/data/drafts"

import { useAutosave } from "./autosave"
import { render } from "./testing"

interface Values {
  notes: string
}

// The hook's latest result, handed out after each render.
let autosave: ReturnType<typeof useAutosave<Values>>
const seen = (next: typeof autosave) => (autosave = next)
function Probe({ id }: { id: string }) {
  const hook = useAutosave<Values>(id)
  useEffect(() => void seen(hook))
  return null
}

// Lets IndexedDB answer, or the saver's 400 ms pause pass.
const settle = (ms = 20) =>
  act(() => new Promise((resolve) => setTimeout(resolve, ms)))

// Unmounted after each test, so a probe left over can't set `autosave`.
let views: ReturnType<typeof render>[] = []
const mount = (id: string) => {
  const view = render(<Probe id={id} />)
  views.push(view)
  return view
}
afterEach(async () => {
  for (const view of views) if (view.container.isConnected) view.unmount()
  views = []
  await queue.delete({ disableAutoOpen: false })
})

describe("useAutosave", () => {
  it("restores the kept values once they are read", async () => {
    await writeForm("new", { notes: "Turtle" })
    mount("new")
    expect(autosave.restored).toBeUndefined()
    await settle()
    expect(autosave.restored).toEqual({ notes: "Turtle" })
  })

  it("opens fresh when nothing is kept, or storage refuses", async () => {
    const view = mount("new")
    await settle()
    expect(autosave.restored).toBeNull()
    view.unmount()

    vi.spyOn(queue.forms, "get").mockRejectedValueOnce(new Error("Refused"))
    mount("dive-a")
    await settle()
    expect(autosave.restored).toBeNull()
  })

  it("reads again for another dive, showing nothing until then", async () => {
    await writeForm("dive-b", { notes: "Shark" })
    const view = mount("dive-a")
    await settle()
    view.rerender(<Probe id="dive-b" />)
    expect(autosave.restored).toBeUndefined()
    await settle()
    expect(autosave.restored).toEqual({ notes: "Shark" })
  })

  it("keeps the last keystrokes when the form closes mid-edit", async () => {
    const view = mount("new")
    await settle()
    autosave.write({ notes: "Tur" })
    view.unmount()
    await settle()
    expect(await readForm("new")).toEqual({ notes: "Tur" })
  })

  it("clears the kept values and a write still waiting", async () => {
    await writeForm("new", { notes: "Turtle" })
    mount("new")
    await settle()
    autosave.write({ notes: "Turtles" })
    await act(() => autosave.clear())
    await settle(450)
    expect(await readForm("new")).toBeUndefined()
  })
})
