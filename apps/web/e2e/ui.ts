import type { Locator } from "@playwright/test"

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
