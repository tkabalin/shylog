// Where the icons over the depth chart go, apart from the drawing so the
// rules can be tested without Recharts. All positions are icon centres in
// the chart's px.

export const iconSize = 14
// Centre to centre for icons of different kinds that had to move apart, so
// two side by side keep 4 px between them: at 2 px a group read as one smudge.
export const iconGap = iconSize + 4

// The point of a hand's red line or the middle of an alarm's band, with the
// second the event starts at.
export interface Mark {
  time: number
  x: number
}

// The spot nearest `centre` clear of every icon already placed, on either
// side. Moving the least keeps an icon by what it marks, where hopping past
// each neighbour in turn sent the stairs over the deep part of a dive.
export function nearestClear(
  centre: number,
  taken: readonly number[],
  left: number,
  right: number
) {
  // Exactly a gap away counts as clear, whatever the rounding.
  const clear = (at: number) =>
    taken.every((other) => Math.abs(at - other) >= iconGap - 1e-6)
  const spots = [centre, ...taken.flatMap((t) => [t - iconGap, t + iconGap])]
  let best: number | null = null
  for (const at of spots) {
    if (at < left || at > right || !clear(at)) continue
    if (best == null || Math.abs(at - centre) < Math.abs(best - centre))
      best = at
  }
  return best ?? centre
}

// Every mandatory stop starts on an ascent alarm, so the hand on its line
// stands for both. Other alarms stay over what they mark even where they
// overlap a hand or each other, as one moved aside read as a separate event;
// the stairs then moves clear of them all. Each icon is kept whole in the plot.
export function placeIcons({
  hands,
  alarms,
  stop,
  left,
  right,
}: {
  hands: readonly Mark[]
  alarms: readonly Mark[]
  stop: number | null
  left: number
  right: number
}) {
  const lo = left + iconSize / 2
  const hi = right - iconSize / 2
  const clamp = (centre: number) => Math.min(Math.max(centre, lo), hi)
  const handsAt = hands.map((hand) => clamp(hand.x))
  const alarmsAt = alarms.map((alarm) =>
    hands.some((hand) => hand.time === alarm.time) ? null : clamp(alarm.x)
  )
  const taken = [
    ...handsAt,
    ...alarmsAt.filter((at): at is number => at != null),
  ]
  return {
    hands: handsAt,
    alarms: alarmsAt,
    stop: stop == null ? null : nearestClear(clamp(stop), taken, lo, hi),
  }
}
