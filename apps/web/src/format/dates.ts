// Dive times are local wall-clock strings at the site with no zone
// (YYYY-MM-DDTHH:mm:ss). They are read as UTC only to name the weekday and
// month, so the phone's own zone can never shift a dive to another day.
const utc = (startTime: string) =>
  new Date(`${startTime.slice(0, 10)}T00:00:00Z`)

const format = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" })

const weekdayDay = format({ weekday: "short", day: "numeric" })
const monthYear = format({ month: "long", year: "numeric" })
// Three letters, as the spec and boards write them; en-GB gives "Sept".
const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")

// A card leaves out the month, which its group's heading gives: "Sat 25".
export const cardDay = (startTime: string) =>
  weekdayDay.format(utc(startTime)).replace(",", "")

// A month group's key and heading: "2026-07", "July 2026".
export const monthKey = (startTime: string) => startTime.slice(0, 7)
export const monthLabel = (startTime: string) =>
  monthYear.format(utc(startTime))

// The detail's title block: "Sat 25 Jul 2026" and "09:12".
export const longDate = (startTime: string) =>
  `${cardDay(startTime)} ${months[Number(startTime.slice(5, 7)) - 1]} ${startTime.slice(0, 4)}`
export const clockTime = (startTime: string) => startTime.slice(11, 16)

export const year = (startTime: string) => startTime.slice(0, 4)
