import type { Locator, Page } from "@playwright/test"

// Waits until an element stops moving: a sheet sliding in, or a card the
// Log is still scrolling. Watched in the page across animation frames, as
// two reads from Playwright can land in one frame and miss the motion.
// Only finite, running animations count, so a spinner can't hold it up,
// and it gives up after about two seconds with a message.
export async function still(locator: Locator) {
  await locator.evaluate(
    (element) =>
      new Promise<void>((resolve, reject) => {
        let last = element.getBoundingClientRect()
        let calm = 0
        let frames = 0
        const animating = () =>
          (element.closest("[role=dialog]") ?? element)
            .getAnimations({ subtree: true })
            .some(
              (animation) =>
                animation.playState === "running" &&
                animation.effect?.getComputedTiming().endTime !== Infinity
            )
        const tick = () => {
          const box = element.getBoundingClientRect()
          const moving = box.x !== last.x || box.y !== last.y || animating()
          calm = moving ? 0 : calm + 1
          last = box
          if (calm >= 3) resolve()
          else if (++frames > 120)
            reject(new Error("Still moving after 120 frames"))
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
  )
}

// Taps a card once the scroll that brings it into view has settled.
export async function tapCard(card: Locator) {
  await card.scrollIntoViewIfNeeded()
  await still(card)
  await card.click()
}

// How many dives the Log lists, added up from its months' headings, as
// only the cards near the screen are mounted. Like the headings, it leaves
// out ignored dives.
export async function listed(page: Page) {
  const counts = await page
    .locator("[data-month-heading] > span")
    .allTextContents()
  return counts.reduce((sum, text) => sum + Number(text.replace(/\D/g, "")), 0)
}

// Whether a full-screen viewer has a short fixed box of its own colour at
// the top. iOS colours the status bar from such a box, and keeps the old
// colour under one that fills the screen, as the viewer itself does.
export async function coloursStatusBar(viewer: Locator) {
  return viewer.evaluate((root) => {
    const colour = getComputedStyle(root).backgroundColor
    return [...root.querySelectorAll("*")].some((element) => {
      const style = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      return (
        style.position === "fixed" &&
        style.backgroundColor === colour &&
        box.top <= 4 &&
        box.height > 10 &&
        box.height < innerHeight * 0.9 &&
        box.width >= innerWidth * 0.9
      )
    })
  })
}
