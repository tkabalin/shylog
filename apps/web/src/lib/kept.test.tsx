import { act, useEffect } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import { dropKept, readKept, useKeptForm } from "./kept"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

interface Values {
  base: string
  name: string
}
const stored = (key: string) => sessionStorage.getItem(`shylog-kept:${key}`)

// The hook's forget, handed out after each render.
let forget: () => void
function Probe({ value }: { value: Values | null }) {
  const end = useKeptForm("form", value)
  useEffect(() => void (forget = end))
  return null
}
function mount(value: Values | null) {
  const container = document.createElement("div")
  const root = createRoot(container)
  act(() => root.render(<Probe value={value} />))
  return {
    rerender: (next: Values | null) =>
      act(() => root.render(<Probe value={next} />)),
    unmount: () => act(() => root.unmount()),
  }
}

afterEach(() => sessionStorage.clear())

describe("useKeptForm", () => {
  it("keeps the latest value and drops it once there is none", () => {
    const view = mount(null)
    expect(stored("form")).toBeNull()
    view.rerender({ base: "a", name: "Tu" })
    view.rerender({ base: "a", name: "Turtle" })
    expect(JSON.parse(stored("form")!)).toEqual({ base: "a", name: "Turtle" })
    view.rerender(null)
    expect(stored("form")).toBeNull()
    view.unmount()
  })

  it("keeps it after the form unmounts, as a swipe back leaves", () => {
    const view = mount({ base: "a", name: "Turtle" })
    view.unmount()
    expect(readKept<Values>("form", () => true)).toEqual({
      base: "a",
      name: "Turtle",
    })
  })

  it("stops keeping once forgotten, so a last render can't write it back", () => {
    const view = mount({ base: "a", name: "Turtle" })
    act(() => forget())
    expect(stored("form")).toBeNull()
    view.rerender({ base: "a", name: "Turtles" })
    expect(stored("form")).toBeNull()
    view.unmount()
  })
})

describe("readKept", () => {
  it("gives back what fits", () => {
    sessionStorage.setItem("shylog-kept:form", '{"base":"a","name":"Turtle"}')
    expect(readKept<Values>("form", (kept) => kept.base === "a")?.name).toBe(
      "Turtle"
    )
    expect(stored("form")).not.toBeNull()
  })

  it("drops what no longer fits, such as an edit of a changed record", () => {
    sessionStorage.setItem("shylog-kept:form", '{"base":"a","name":"Turtle"}')
    expect(readKept<Values>("form", (kept) => kept.base === "b")).toBeNull()
    expect(stored("form")).toBeNull()
  })

  it("drops text it can't read, or a shape its check throws on", () => {
    sessionStorage.setItem("shylog-kept:form", "{not json")
    expect(readKept("form", () => true)).toBeNull()
    expect(stored("form")).toBeNull()
    sessionStorage.setItem("shylog-kept:form", "{}")
    expect(
      readKept<{ list: string[] }>("form", (kept) => kept.list.length > 0)
    ).toBeNull()
    expect(stored("form")).toBeNull()
  })

  it("reads nothing when nothing was kept", () => {
    expect(readKept("form", () => true)).toBeNull()
    dropKept("form")
  })
})
