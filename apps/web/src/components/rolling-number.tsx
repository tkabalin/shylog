import { useEffect, useState } from "react"
import { cn } from "cn"

interface Digit {
  key: string
  // Counted from the right, so 99 → 100 lines up units with units.
  place: number
  char: string
  // The change it entered with; nothing rolls for round 0, the first render.
  round: number
  // The change that sent it out, once it is leaving.
  out?: number
  // 1 as the number grows: in from below, out above; -1 the other way.
  dir: 1 | -1
}

const digitsOf = (text: string, round: number, dir: 1 | -1): Digit[] =>
  [...text].reverse().map((char, place) => ({
    key: `${round}-${place}`,
    place,
    char,
    round,
    dir,
  }))

// iOS's numeric text transition: changed digits roll up as it grows, down
// as it falls. Each keeps its element, so a change mid-roll carries on, and
// starts a frame late, as WebKit can skip one begun in a long tap.
export function RollingNumber({
  value,
  text,
}: {
  value: number
  text: string
}) {
  const [shown, setShown] = useState(() => ({
    value,
    text,
    round: 0,
    digits: digitsOf(text, 0, 1),
  }))
  const [settled, setSettled] = useState(0)
  if (shown.value !== value || shown.text !== text) {
    const round = shown.round + 1
    const dir = value >= shown.value ? 1 : -1
    const current = new Map(
      shown.digits.filter((d) => d.out == null).map((d) => [d.place, d])
    )
    // Digits that started leaving a change ago are done; older ones go.
    const digits = shown.digits.filter(
      (d) => d.out != null && d.out >= round - 1
    )
    for (const digit of digitsOf(text, round, dir)) {
      const was = current.get(digit.place)
      current.delete(digit.place)
      if (was?.char === digit.char) {
        digits.push(was)
        continue
      }
      if (was) digits.push({ ...was, out: round, dir })
      digits.push(digit)
    }
    // Places the number no longer has leave too.
    for (const was of current.values()) digits.push({ ...was, out: round, dir })
    setShown({ value, text, round, digits })
  }
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSettled(shown.round))
    return () => cancelAnimationFrame(frame)
  }, [shown.round])

  const places = [...new Set(shown.digits.map((d) => d.place))].sort(
    (a, b) => b - a
  )
  return (
    <>
      <span aria-hidden className="inline-flex">
        {places.map((place) => {
          const here = shown.digits.filter((d) => d.place === place)
          const current = here.find((d) => d.out == null)
          // A place the number gains or loses eases its width open or shut
          // over the roll, so the digits beside it never overlap and the
          // words after it don't jump.
          const narrow = current
            ? current.round > settled && here.length === 1 && shown.round > 0
            : here.every((d) => d.out! <= settled)
          return (
            <span
              key={place}
              className={cn(
                "inline-grid transition-[grid-template-columns] duration-400 ease-roll motion-reduce:transition-none",
                narrow ? "grid-cols-[0fr]" : "grid-cols-[1fr]"
              )}
            >
              {/* Clipped only for the roll: it reaches past the digit's
                  advance on the right, which negative tracking puts inside
                  the ink, and gives the room back so the width holds. */}
              <span className="relative -mr-[0.1em] min-w-0 overflow-clip pr-[0.1em]">
                {here.map((d) => {
                  const leaving = d.out != null && d.out <= settled
                  return (
                    <span
                      key={d.key}
                      className={cn(
                        "inline-block transition-[translate,opacity] duration-400 ease-roll motion-reduce:translate-y-0 motion-reduce:duration-150",
                        // Out of the flow beside the digit taking its place;
                        // alone, it holds the width while that eases shut.
                        d.out != null && current && "absolute inset-0",
                        leaving &&
                          cn(
                            "opacity-0",
                            d.dir > 0 ? "-translate-y-full" : "translate-y-full"
                          ),
                        d.out == null &&
                          d.round > settled &&
                          cn(
                            "motion-reduce:opacity-0",
                            d.dir > 0 ? "translate-y-full" : "-translate-y-full"
                          )
                      )}
                    >
                      {d.char}
                    </span>
                  )
                })}
              </span>
            </span>
          )
        })}
      </span>
      {/* Last, so the text reads straight on into what follows it. */}
      <span className="sr-only">{text}</span>
    </>
  )
}

// A value a frame late, to change in step with a roll that starts then:
// the Log's "dive" or "dives".
export function useFrameLater<T>(value: T) {
  const [later, setLater] = useState(value)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setLater(value))
    return () => cancelAnimationFrame(frame)
  }, [value])
  return later
}
