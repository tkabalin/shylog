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

// When a dive was deleted: an instant the server stamped, so unlike a dive's
// own time it is read in the phone's zone, as "today" is.
const localDay = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

// The deleted dive's pill: "Deleted 2 Aug".
export const deletedDay = (deletedAt: string) => {
  const date = new Date(deletedAt)
  return `${date.getDate()} ${months[date.getMonth()]}`
}

// Recently deleted's groups: today, yesterday, then by month, with the
// year once it isn't this one.
export function deletedGroup(deletedAt: string, now = new Date()) {
  const date = new Date(deletedAt)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (localDay(date) === localDay(now)) return "Deleted today"
  if (localDay(date) === localDay(yesterday)) return "Deleted yesterday"
  const month = date.toLocaleString("en-GB", { month: "long" })
  return date.getFullYear() === now.getFullYear()
    ? `Deleted in ${month}`
    : `Deleted in ${month} ${date.getFullYear()}`
}
