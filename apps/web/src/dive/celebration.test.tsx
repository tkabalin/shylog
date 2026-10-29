import { useRef } from "react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

import type { Dive } from "@/data/db"

import { useSaveCelebration } from "./celebration"
import { render, testDive } from "./form/testing"

// One milestone, so the burst has a number to play for.
vi.mock("./milestones", () => ({ milestones: [48] }))

let reduce = false
beforeEach(() => {
  reduce = false
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
  }))
  // jsdom lays nothing out and has no Web Animations: the figure sits a
  // little way down the screen, a frame comes at once, and animations never
  // finish, so layers stay put.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(20, 200, 100, 34)
  )
  vi.stubGlobal("requestAnimationFrame", (tick: FrameRequestCallback) => {
    tick(0)
    return 0
  })
  Element.prototype.animate = vi.fn(
    () =>
      ({
        finished: new Promise(() => {}),
        cancel: vi.fn(),
      }) as unknown as Animation
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function Page({ dive, saved }: { dive: Dive; saved: boolean }) {
  const headline = useRef<HTMLDListElement>(null)
  useSaveCelebration(dive, saved, headline)
  return (
    <dl ref={headline}>
      <dd>14.2</dd>
    </dl>
  )
}

// Each layer of bubbles, by how many it holds.
const layers = () =>
  [...document.body.querySelectorAll("[aria-hidden=true]")].map(
    (layer) => layer.children.length
  )

test("streams bubbles off the max depth figure at once, and no burst for an ordinary number", () => {
  const page = render(
    <Page dive={testDive({ id: "dive-a", number: null })} saved />
  )
  expect(layers()).toEqual([7])

  page.rerender(<Page dive={testDive({ id: "dive-a", number: 47 })} saved />)
  expect(layers()).toEqual([7])

  // Leaving the page takes the bubbles with it.
  page.unmount()
  expect(layers()).toEqual([])
})

test("plays once, so the dive opened again plays nothing", () => {
  render(<Page dive={testDive({ id: "dive-b" })} saved />).unmount()
  const again = render(<Page dive={testDive({ id: "dive-b" })} saved />)
  expect(layers()).toEqual([])
  again.unmount()
})

test("plays no stream when the figure is off screen", () => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(20, -400, 100, 34)
  )
  const page = render(<Page dive={testDive({ id: "dive-f" })} saved />)
  expect(layers()).toEqual([])
  page.unmount()
})

test("plays nothing for a dive that wasn't just saved", () => {
  const page = render(<Page dive={testDive({ id: "dive-c" })} saved={false} />)
  expect(layers()).toEqual([])
  page.unmount()
})

test("adds the burst when the number is a milestone", () => {
  const page = render(
    <Page dive={testDive({ id: "dive-d", number: null })} saved />
  )
  page.rerender(<Page dive={testDive({ id: "dive-d", number: 48 })} saved />)
  expect(layers()).toEqual([7, 12])
  page.unmount()
})

test("plays nothing under reduced motion", () => {
  reduce = true
  const page = render(
    <Page dive={testDive({ id: "dive-e", number: 48 })} saved />
  )
  expect(layers()).toEqual([])
  page.unmount()
})
