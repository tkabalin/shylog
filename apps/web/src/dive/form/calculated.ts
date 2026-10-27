import {
  diveOxygen,
  maxPo2,
  mod,
  sacDurationAndDepth,
  sacRate,
  type Water,
} from "@shylog/core"

import type { Dive, Settings } from "@/data/db"

import { toFields, type DraftFields, type FormValues } from "./values"

// The calculated block's figures, live from what is typed so far, by the
// same core functions as the detail. Fields that don't parse yet count as
// empty, so a half-typed figure never shows a stale result.
export function formFigures(
  values: FormValues,
  {
    water,
    settings,
    dive,
    original,
    handDuration,
    handAverageDepth,
  }: {
    water: Water
    settings: Settings
    // The saved dive, whose samples' figures SAC uses where no hand value
    // replaces them, as on the detail.
    dive?: Dive
    // The form as opened: a field still showing it keeps the stored value,
    // so a rounded 32.7 doesn't change figures worked out from 32.66.
    original?: FormValues
    handDuration: boolean
    handAverageDepth: boolean
  }
) {
  const fields: DraftFields = { ...toFields(values).fields }
  if (dive && original) {
    for (const name of ["duration", "maxDepth", "averageDepth"] as const) {
      if (values[name] === original[name] && dive[name] != null)
        fields[name] = dive[name]
    }
  }
  const oxygen =
    !values.nitrox || fields.oxygen != null
      ? diveOxygen({ nitrox: values.nitrox, oxygen: fields.oxygen })
      : null
  const limit = settings.maxPo2

  const sac =
    fields.duration == null
      ? null
      : sacRate(
          {
            startPressure: fields.startPressure ?? null,
            endPressure: fields.endPressure ?? null,
            cylinderVolume: fields.cylinderVolume ?? null,
            oxygen,
            ...sacDurationAndDepth(
              {
                duration: fields.duration,
                averageDepth: fields.averageDepth ?? null,
              },
              { duration: handDuration, averageDepth: handAverageDepth },
              dive?.sampleDuration && dive.sampleAverageDepth != null
                ? {
                    duration: dive.sampleDuration,
                    averageDepth: dive.sampleAverageDepth,
                  }
                : null
            ),
          },
          water
        )
  const po2 =
    oxygen == null || fields.maxDepth == null
      ? null
      : maxPo2(oxygen, fields.maxDepth, water)
  const modDepth = oxygen == null ? null : mod(oxygen, limit, water)
  return {
    sac,
    maxPo2: po2,
    po2Over: po2 != null && po2 > limit,
    // A limit at or below the surface PO₂ gives no depth to show.
    mod: modDepth != null && modDepth > 0 ? modDepth : null,
    limit,
  }
}
