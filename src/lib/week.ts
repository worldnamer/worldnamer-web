// Weeks on the visitor's local calendar, Monday to Sunday. Days travel as 'YYYY-MM-DD' strings, the API's format.
//
// Two JavaScript habits would put these a day off in US evenings, so they are avoided throughout: Date's ISO string
// method converts to UTC, and the Date constructor reads a bare 'YYYY-MM-DD' string as UTC midnight. Dates are built
// with new Date(y, m - 1, d), and days are added through that constructor rather than as milliseconds, because a day
// is 23 or 25 hours long when daylight saving time starts or ends.

const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const longMonths = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
// Indexed by getDay(), so Sunday comes first.
const shortWeekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const longWeekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Local midnight of the day, plus `days` days.
function fromIso(iso: string, days = 0): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d + days)
}

// The Monday of the week that `date` falls in, on the local calendar.
export function weekStartOf(date: Date): string {
  const daysSinceMonday = (date.getDay() + 6) % 7
  return toIso(new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysSinceMonday))
}

// Today's local date. This file is the only place the app reads the clock for habits; components call it once, from a
// lazy useState initializer, because reading the clock during render is impure.
export function today(): string {
  return toIso(new Date())
}

export function currentWeekStart(): string {
  return weekStartOf(new Date())
}

export function addWeeks(weekStart: string, n: number): string {
  return toIso(fromIso(weekStart, n * 7))
}

// The seven days of the week, Monday first.
export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => toIso(fromIso(weekStart, i)))
}

// 'Oct 26 – Nov 1' when the whole week is in the current year; otherwise the Sunday's year once, at the end.
export function formatWeekRange(weekStart: string, currentYear: number): string {
  const start = fromIso(weekStart)
  const end = fromIso(weekStart, 6)
  const range = `${shortMonths[start.getMonth()]} ${start.getDate()} – ${shortMonths[end.getMonth()]} ${end.getDate()}`
  const sameYear = start.getFullYear() === currentYear && end.getFullYear() === currentYear
  return sameYear ? range : `${range}, ${end.getFullYear()}`
}

// 'Mon', for a column header.
export function formatDayHeader(iso: string): string {
  return shortWeekdays[fromIso(iso).getDay()]
}

// 'Monday, October 26', for a checkbox's accessible name.
export function formatDayLabel(iso: string): string {
  const date = fromIso(iso)
  return `${longWeekdays[date.getDay()]}, ${longMonths[date.getMonth()]} ${date.getDate()}`
}
