import { act, useLayoutEffect } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it } from "vitest"

import { preloadable } from "./preloadable"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => document.body.replaceChildren())

const Sheet = ({ name }: { name: string }) => <p>{name}</p>

function mount(element: React.ReactNode) {
  const host = document.createElement("div")
  document.body.append(host)
  // Synchronous act: the render is checked before any promise settles.
  act(() => createRoot(host).render(element))
  return host
}

// React.lazy would suspend here, and React would hold the fallback 300 ms.
it("draws on its first render once its code is in", async () => {
  const { Component, preload } = preloadable(() => Promise.resolve(Sheet))
  await preload()
  expect(mount(<Component name="Edit card" />).textContent).toBe("Edit card")
})

it("draws once its code arrives, and loads it only once", async () => {
  let loads = 0
  const { Component, preload } = preloadable(() => {
    loads++
    return Promise.resolve(Sheet)
  })
  const host = mount(<Component name="Edit card" />)
  expect(host.textContent).toBe("")
  await act(() => preload())
  expect(host.textContent).toBe("Edit card")
  expect(loads).toBe(1)
})

it("tries again after a failed load", async () => {
  let fail = true
  const { preload } = preloadable(() =>
    fail ? Promise.reject(new Error("offline")) : Promise.resolve(Sheet)
  )
  await expect(preload()).rejects.toThrow("offline")
  fail = false
  await expect(preload()).resolves.toBe(Sheet)
})

// The CI flake: picked screenshots never opened New card in WebKit.
it("draws when its code arrives between commit and effect", async () => {
  let arrive!: (sheet: typeof Sheet) => void
  const { Component, preload } = preloadable(
    () => new Promise<typeof Sheet>((resolve) => (arrive = resolve))
  )
  void preload()
  // Lands in a microtask after the commit, before React runs passive effects.
  function Arrives() {
    useLayoutEffect(() => arrive(Sheet), [])
    return null
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  try {
    const host = document.createElement("div")
    document.body.append(host)
    createRoot(host).render(
      <>
        <Component name="New card" />
        <Arrives />
      </>
    )
    await expect.poll(() => host.textContent).toBe("New card")
  } finally {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
  }
})
