import { useSyncExternalStore } from "react"
import { navyNoStopTime, noStopTime } from "@shylog/core"

import { localValue } from "@/lib/local-value"

export type NdlModel = "navy" | "gf100" | "gf85" | "gf70"

export const ndlModels: { value: NdlModel; label: string }[] = [
  { value: "navy", label: "US Navy" },
  { value: "gf100", label: "GF 100" },
  { value: "gf85", label: "GF 85" },
  { value: "gf70", label: "GF 70" },
]

// GF high per model; GF low stays at Subsurface's planner default of 30.
const gfHigh = { gf100: 100, gf85: 85, gf70: 70 } as const

// One choice for both tools, kept on this phone, as the NDL a diver plans
// with is theirs and not the log's.
const store = localValue<NdlModel>(
  "ndl-model",
  (stored) =>
    ndlModels.some((model) => model.value === stored)
      ? (stored as NdlModel)
      : "gf85",
  (model) => model
)

export const setNdlModel = store.set

export const useNdlModel = () =>
  useSyncExternalStore(store.subscribe, store.get)

// The tools have no dive, so no site's water: salt at 1 atm.
const salt = { waterType: "salt" } as const

// A stepper held down asks for the same depths again and again.
const known = new Map<string, string>()

// The NDL as the tools show it: whole minutes, rounded down, with "6 h+"
// past Subsurface's planner's 6 hours, "No limit" where the Navy table has
// none, and a dash where no dive is without stops.
export function ndlText(model: NdlModel, oxygen: number, depth: number) {
  const key = `${model} ${oxygen} ${depth}`
  let text = known.get(key)
  if (text === undefined) {
    if (model === "navy") {
      const minutes = navyNoStopTime(oxygen, depth)
      text = minutes === null ? "No limit" : minutes ? `${minutes} min` : "—"
    } else {
      const seconds = noStopTime(
        oxygen,
        depth,
        { low: 30, high: gfHigh[model] },
        salt
      )
      text =
        seconds === null
          ? "6 h+"
          : seconds
            ? `${Math.floor(seconds / 60)} min`
            : "—"
    }
    known.set(key, text)
  }
  return text
}

// What each model is, for the info beside the picker.
const buhlmann = (high: number) => ({
  title: `Bühlmann GF 30/${high}`,
  body: `ZHL-16C with gradient factors 30/${high}, as Subsurface plans a first dive of the day: down at 18 m/min, then straight up at 9 m/min. The NDL counts from leaving the surface.`,
})
export const modelInfo: Record<NdlModel, { title: string; body: string }> = {
  navy: {
    title: "US Navy air table",
    body: "The no-decompression limits of the US Navy Diving Manual, Rev 7, read at the next deeper row. Nitrox is read at its equivalent air depth.",
  },
  gf100: buhlmann(100),
  gf85: buhlmann(85),
  gf70: buhlmann(70),
}

// Caches the NDLs the next tap will likely want, so its glide starts at once
// (a cold table took 55–75 ms on a laptop). One figure a task from 300 ms,
// after a glide's colour switches; a newer call stops an older one.
let generation = 0
export function warmNdl(model: NdlModel, jobs: [number, number][]) {
  const mine = ++generation
  let next = 0
  let timer: ReturnType<typeof setTimeout>
  const work = () => {
    if (mine !== generation || next >= jobs.length) return
    const [oxygen, depth] = jobs[next++]!
    ndlText(model, oxygen, depth)
    timer = setTimeout(work, 0)
  }
  timer = setTimeout(work, 300)
  return () => clearTimeout(timer)
}
