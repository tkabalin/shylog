import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { clearForm, formSaver, readForm, writeForm } from "./autosave"
import { QueueDb } from "./drafts"

interface Values {
  notes: string
  maxDepth: string
}

let queue: QueueDb
beforeEach(() => {
  queue = new QueueDb(`test-queue-${crypto.randomUUID()}`)
})
afterEach(() => queue.delete())

describe("form autosave", () => {
  it("writes once typing pauses, with the latest values", async () => {
    const put = vi.spyOn(queue.forms, "put")
    const saver = formSaver<Values>("new", { db: queue, delay: 30 })
    saver.write({ notes: "T", maxDepth: "" })
    saver.write({ notes: "Tu", maxDepth: "" })
    saver.write({ notes: "Turtle", maxDepth: "18,4" })
    expect(put).not.toHaveBeenCalled()

    await vi.waitFor(() => expect(put).toHaveBeenCalledOnce())
    await saver.flush()
    expect(await readForm<Values>("new", queue)).toEqual({
      notes: "Turtle",
      maxDepth: "18,4",
    })
  })

  it("writes at once on flush, as when the page is hidden", async () => {
    const saver = formSaver<Values>("dive-a", { db: queue })
    saver.write({ notes: "Wreck", maxDepth: "" })
    await saver.flush()
    expect(await readForm("dive-a", queue)).toEqual({
      notes: "Wreck",
      maxDepth: "",
    })
  })

  it("keeps one record for a new dive and one per dive being edited", async () => {
    await writeForm("new", { notes: "First" }, queue)
    await writeForm("dive-a", { notes: "Edit" }, queue)
    await writeForm("new", { notes: "Second" }, queue)
    expect(await queue.forms.count()).toBe(2)
    expect(await readForm("new", queue)).toEqual({ notes: "Second" })
    expect(await readForm("dive-a", queue)).toEqual({ notes: "Edit" })
    expect(await readForm("dive-b", queue)).toBeUndefined()
  })

  it("is cleared on save or discard, with a pending write cancelled", async () => {
    const saver = formSaver<Values>("new", { db: queue, delay: 10 })
    saver.write({ notes: "Saved", maxDepth: "" })
    await saver.flush()
    saver.write({ notes: "Typed after", maxDepth: "" })
    saver.cancel()
    await clearForm("new", queue)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(await readForm("new", queue)).toBeUndefined()
  })

  it("is not a draft: no draft, no ops", async () => {
    const saver = formSaver<Values>("new", { db: queue })
    saver.write({ notes: "Turtle", maxDepth: "18" })
    await saver.flush()
    expect(await queue.drafts.count()).toBe(0)
    expect(await queue.ops.count()).toBe(0)
  })
})
