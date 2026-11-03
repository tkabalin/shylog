import { afterEach, describe, expect, it, vi } from "vitest"

// Each test loads the store afresh, as a launch does.
const load = async () => {
  vi.resetModules()
  return import("./smooth-temperature")
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe("the smoothed temperature setting", () => {
  it("is on unless this phone turned it off", async () => {
    expect((await load()).readSmoothTemperature()).toBe(true)
    localStorage.setItem("smooth-temperature", "off")
    expect((await load()).readSmoothTemperature()).toBe(false)
  })

  it("keeps a change and tells whoever is listening", async () => {
    const store = await load()
    const heard = vi.fn()
    const stop = store.subscribeSmoothTemperature(heard)
    store.setSmoothTemperature(false)
    expect(heard).toHaveBeenCalledOnce()
    expect(store.readSmoothTemperature()).toBe(false)
    expect(localStorage.getItem("smooth-temperature")).toBe("off")
    stop()
    store.setSmoothTemperature(true)
    expect(heard).toHaveBeenCalledOnce()
  })

  it("follows another window's change", async () => {
    const store = await load()
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "smooth-temperature",
        newValue: "off",
        storageArea: localStorage,
      })
    )
    expect(store.readSmoothTemperature()).toBe(false)
  })

  it("still works where storage is refused", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied")
    })
    const store = await load()
    expect(store.readSmoothTemperature()).toBe(true)
    store.setSmoothTemperature(false)
    expect(store.readSmoothTemperature()).toBe(false)
  })
})
