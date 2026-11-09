import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { StorageRow } from "@/you/storage-sheet"

import { protect, protectOnFirstLaunch, readProtection } from "./storage"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

// A browser's StorageManager that grants persistence when asked.
function browser(granted = true) {
  let kept = false
  return {
    persist: vi.fn(async () => (kept = granted)),
    persisted: vi.fn(async () => kept),
  } as unknown as StorageManager & {
    persist: ReturnType<typeof vi.fn>
    persisted: ReturnType<typeof vi.fn>
  }
}

function local() {
  const items = new Map<string, string>()
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  }
}

describe("storage protection", () => {
  it("is asked for on the first launch only, and again once installed", async () => {
    const storage = browser(false)
    const store = local()
    await protectOnFirstLaunch(storage, store, false)
    expect(storage.persist).toHaveBeenCalledOnce()
    await protectOnFirstLaunch(storage, store, false)
    expect(storage.persist).toHaveBeenCalledOnce()
    // Later launches still read whether it holds.
    expect(storage.persisted).toHaveBeenCalledTimes(2)
    // Added to the Home Screen, sharing the tab's storage, it asks again.
    await protectOnFirstLaunch(storage, store, true)
    await protectOnFirstLaunch(storage, store, true)
    expect(storage.persist).toHaveBeenCalledTimes(2)
  })

  it("asks every launch when local storage is blocked", async () => {
    const storage = browser()
    const blocked = {
      getItem: () => {
        throw new DOMException("Blocked", "SecurityError")
      },
      setItem: () => {},
    }
    await protectOnFirstLaunch(storage, blocked, false)
    await protectOnFirstLaunch(storage, blocked, false)
    expect(storage.persist).toHaveBeenCalledTimes(2)
  })
})

describe("the Offline storage row and sheet", () => {
  let root: Root
  let host: HTMLDivElement
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    // A phone: no fine pointer, so sheets rather than dialogs.
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    document.body.innerHTML = ""
  })

  const render = () => act(() => root.render(createElement(StorageRow)))
  const row = () =>
    host.querySelector<HTMLButtonElement>(
      "button[aria-label^='Offline storage']"
    )!

  it("shows Protected once the browser keeps the data", async () => {
    await readProtection(browser())
    await protect(browser())
    render()
    expect(row().getAttribute("aria-label")).toBe(
      "Offline storage, protected. More about this"
    )
    expect(row().textContent).toContain("Protected")
    expect(row().textContent).toContain(
      "Dives saved on this phone won’t be cleared"
    )
  })

  it("offers Keep them safe, which asks the browser, when it doesn't", async () => {
    await readProtection(browser(false))
    render()
    expect(row().textContent).toContain("Keep them safe")
    expect(row().textContent).toContain(
      "Your browser may clear dives saved on this phone"
    )

    await act(async () => row().click())
    // The sheet's copy, as SettingsHifi has it.
    const sheet = document.querySelector("[role=dialog]")!
    expect(sheet.textContent).toContain("Offline storage")
    expect(sheet.textContent).toContain(
      "Dives you log without signal are saved on this phone until they sync. Browsers can clear a website’s saved data when the phone runs low on space. Protected storage asks the browser to keep Shylog’s data."
    )
    expect(sheet.textContent).toContain(
      // The menu path is held together with no-break spaces.
      "iPhoneOpen Shylog from your Home Screen. If it isn’t there, use Share\u00a0›\u00a0Add to Home Screen in Safari."
    )
    expect(sheet.textContent).toContain(
      "AndroidTap Keep them safe and allow it when the browser asks."
    )
    const buttons = [...sheet.querySelectorAll("button")].map(
      (button) => button.textContent
    )
    expect(buttons).toContain("Keep them safe")
    expect(buttons).toContain("Not now")

    const storage = browser()
    vi.stubGlobal("navigator", { ...navigator, storage })
    const keep = [...sheet.querySelectorAll("button")].find(
      (button) => button.textContent === "Keep them safe"
    )!
    await act(async () => keep.click())
    expect(storage.persist).toHaveBeenCalledOnce()
    expect(row().textContent).toContain("Protected")
    vi.unstubAllGlobals()
  })
})
