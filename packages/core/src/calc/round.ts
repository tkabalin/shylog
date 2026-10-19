// Subsurface rounds with C's lrint, which sends halves to the even
// neighbour; Math.round sends them up, so 2.5 mbar would differ. The + 0
// turns Math.round's -0 into the 0 an integer has.
export function lrint(value: number): number {
  const rounded = Math.round(value)
  return (
    (rounded - value === 0.5 && rounded % 2 !== 0 ? rounded - 1 : rounded) + 0
  )
}

// C's integer division, which truncates towards zero, again without -0.
export const intDiv = (a: number, b: number) => Math.trunc(a / b) + 0
