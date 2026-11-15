// The physics the card viewer and the crop sheet share, so a pinch, a pan
// and its settle feel the same in both.

// Critically damped, as nothing here was thrown: a settle, not a bounce.
export const settle = { type: "spring", bounce: 0, duration: 0.4 } as const

// Apple's momentum projection: where a flick would come to rest.
export const project = (velocity: number) => ((velocity / 1000) * 0.998) / 0.002

// Past a bound the page follows less the further it goes, as a scroll view
// resists at its end.
export function rubberband(
  value: number,
  min: number,
  max: number,
  size: number
) {
  const band = (over: number) => (over * size * 0.55) / (size + 0.55 * over)
  if (value < min) return min - band(min - value)
  if (value > max) return max + band(value - max)
  return value
}

// The inverse: where the finger would be for a value past a bound, so a
// grab during a bounce carries on from there rather than jumping.
export function unband(value: number, min: number, max: number, size: number) {
  const raw = (over: number) =>
    (over * size) / (0.55 * Math.max(size - over, 1))
  if (value < min) return min - raw(min - value)
  if (value > max) return max + raw(value - max)
  return value
}

// Scale resists past its most like a scroll view, and below 1x at half
// speed.
export const bandScale = (raw: number, most: number) =>
  raw > most
    ? rubberband(raw, 0, most, most)
    : raw < 1
      ? 1 - (1 - raw) / 2
      : raw
export const unbandScale = (shown: number, most: number) =>
  shown > most
    ? unband(shown, 0, most, most)
    : shown < 1
      ? 1 - (1 - shown) * 2
      : shown

// A momentum pan's slowing, as a scroll's, springing back off an edge.
export const inertia = {
  type: "inertia",
  power: 0.8,
  timeConstant: 325,
  bounceStiffness: 300,
  bounceDamping: 40,
} as const
