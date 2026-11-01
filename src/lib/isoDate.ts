// Days on the visitor's local calendar, written 'YYYY-MM-DD', the API's format. Dates travel as these strings; a
// JavaScript Date is made from one only where something needs it (a calendar, a weekday), and turned back here.
//
// Two JavaScript habits would put a day off in US evenings, so they are avoided throughout: Date's ISO string method
// converts to UTC, and the Date constructor reads a bare 'YYYY-MM-DD' string as UTC midnight. Dates are built with
// new Date(y, m - 1, d) and read with the local getters, and days are added through that constructor rather than as
// milliseconds, because a day is 23 or 25 hours long when daylight saving time starts or ends.

const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// The local calendar day of `date`, whatever its time.
export function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Local midnight of the day, plus `days` days.
export function fromIso(iso: string, days = 0): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d + days)
}

// 'Nov 5' for a day in `currentYear`, 'Nov 5, 2027' for any other, for a task's due date.
export function formatDueDate(iso: string, currentYear: number): string {
  const date = fromIso(iso)
  const day = `${shortMonths[date.getMonth()]} ${date.getDate()}`
  return date.getFullYear() === currentYear ? day : `${day}, ${date.getFullYear()}`
}
