import type { CountryCode } from "../countries.ts"
import { zoneCities } from "../zones.ts"

// Sunrise and sunset by the sunrise equation (Wikipedia's, after Meeus),
// good to a minute or two, with the sun's centre 0.833° below the horizon
// for refraction and its radius, as published sunset times use.

const rad = Math.PI / 180
const day = 86_400_000
const j2000 = Date.UTC(2000, 0, 1, 12)

// Local clocks, one formatter per zone as they're slow to build.
const clocks = new Map<string, Intl.DateTimeFormat>()
function wallClock(zone: string, ms: number) {
  let clock = clocks.get(zone)
  if (!clock) {
    clock = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    })
    clocks.set(zone, clock)
  }
  const part = Object.fromEntries(
    clock.formatToParts(ms).map((p) => [p.type, Number(p.value)])
  )
  return Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute)
}

// Minutes from local midnight on `date` (YYYY-MM-DD) to sunrise and sunset
// at a place on `zone`'s clocks. With no sunrise that day both are Infinity
// the wrong way round, so every time is before sunrise or after sunset;
// with no sunset, every time is between them.
export function sunTimes(
  date: string,
  latitude: number,
  longitude: number,
  zone: string
): { rise: number; set: number } {
  const midnight = Date.parse(`${date}T00:00:00Z`)
  const minutes = (julian: number) =>
    (wallClock(zone, (julian - 2_440_587.5) * day) - midnight) / 60_000
  // The solar day whose transit is nearest the zone's noon on this date, so
  // a clock far from solar time (Tonga's UTC+13 west of 180°) still lands
  // on its own date: transits fall at j2000 + n - longitude / 360.
  const noon = midnight + day / 2
  const offset = wallClock(zone, noon) - noon
  const n = Math.round((noon - offset - j2000) / day + longitude / 360)
  const sun = solar(n, latitude, longitude)
  // Only on a date the zone skipped (Samoa's 30 December 2011).
  const noonAt = minutes(sun.transit)
  if (noonAt < 0 || noonAt >= 1440)
    throw new RangeError(`${zone} skipped ${date}`)
  if (sun.cosHour > 1) return { rise: Infinity, set: -Infinity }
  if (sun.cosHour < -1) return { rise: -Infinity, set: Infinity }
  const hour = Math.acos(sun.cosHour) / rad / 360
  return {
    rise: minutes(sun.transit - hour),
    set: minutes(sun.transit + hour),
  }
}

// Solar transit (a Julian date) and the cosine of the hour angle at sunset
// for day `n` after 1 January 2000, at a longitude east of Greenwich.
function solar(n: number, latitude: number, longitude: number) {
  const mean = n + 0.0008 - longitude / 360
  const anomaly = (357.5291 + 0.98560028 * mean) % 360
  const m = anomaly * rad
  const centre =
    1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m)
  const ecliptic = ((anomaly + centre + 180 + 102.9372) % 360) * rad
  const transit =
    2_451_545 + mean + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * ecliptic)
  const declination = Math.asin(Math.sin(ecliptic) * Math.sin(23.4397 * rad))
  const cosHour =
    (Math.sin(-0.833 * rad) -
      Math.sin(latitude * rad) * Math.sin(declination)) /
    (Math.cos(latitude * rad) * Math.cos(declination))
  return { transit, cosHour }
}

// Sites have no position, so a country takes the sunrise and sunset of one
// of its clocks' cities: the median by sunset, as clocks follow longitude
// and the spread is mostly latitude. One city's pair, so a polar night at
// one station never mixes with daylight at another.
export function countrySunTimes(date: string, country: CountryCode) {
  const times = zoneCities
    .filter(([code]) => code === country)
    .flatMap(([, latitude, longitude, zone]) => {
      // A phone whose time zone data predates a zone (America/Coyhaique,
      // added in 2025) refuses it; the country's other clocks still count.
      try {
        return [sunTimes(date, latitude, longitude, zone)]
      } catch {
        return []
      }
    })
    // Polar night sorts first and the midnight sun last; subtracting two
    // equal Infinities would give NaN.
    .sort((a, b) => Number(a.set > b.set) - Number(a.set < b.set))
  // The lower middle of an even count.
  return times[Math.floor((times.length - 1) / 2)] ?? null
}

export type Dark =
  | { kind: "afterSunset"; at: number }
  | { kind: "beforeSunrise"; at: number }
  | { kind: "noSunrise" }

// Whether any part of a dive was in the dark, for suggesting the Night tag:
// it ended after sunset or started before sunrise. `start` is the local
// YYYY-MM-DDTHH:mm, and a dive with no duration yet counts from its start.
export function diveDark(
  start: string,
  durationMinutes: number | null,
  country: CountryCode
): Dark | null {
  const date = start.slice(0, 10)
  const sun = countrySunTimes(date, country)
  if (!sun) return null
  if (sun.rise === Infinity) return { kind: "noSunrise" }
  const from = Number(start.slice(11, 13)) * 60 + Number(start.slice(14, 16))
  const to = from + (durationMinutes ?? 0)
  if (from < sun.rise) {
    // The night before sunrise starts at the previous day's sunset, which
    // can be after midnight (Reykjavik in June), so a dive just after
    // midnight may start in that evening's light.
    const previous = new Date(Date.parse(`${date}T00:00:00Z`) - day)
    const evening =
      countrySunTimes(previous.toISOString().slice(0, 10), country)!.set - 1440
    if (from >= evening) return { kind: "beforeSunrise", at: sun.rise }
    if (to > evening) return { kind: "afterSunset", at: evening }
  }
  if (to > sun.set) return { kind: "afterSunset", at: sun.set }
  return null
}
