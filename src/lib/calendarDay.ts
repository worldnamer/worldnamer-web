import type { TodayEvent } from '@/api/googleCalendarConnection'
import { toIso } from '@/lib/isoDate'

// Picks the events of one day on the visitor's own calendar and labels them. The API sends about four days of events
// and knows nothing of the visitor's time zone, so the day is chosen here. No date library is used: day bounds come
// from the browser's Date (new Date(y, m, d) and d + 1, which stay correct on a 23 or 25 hour daylight saving day) and
// clock text from Intl.

export type EventRow = {
  event: TodayEvent
  // "All day", "Until 2:00 AM", or the start time.
  label: string
  // Epoch milliseconds when the event ends, or null for an all-day event; the card dims a row once the clock passes it.
  endsAtMs: number | null
}

// "9:00 AM" in the browser's own locale and zone. Built per call: Intl.DateTimeFormat objects are costly to create, but
// the card formats a handful of times a minute at most.
export function formatClock(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

// Local midnight at the start of the day containing `now`, and at the start of the next day.
export function dayBounds(now: Date): { start: Date; end: Date } {
  return {
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
  }
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// The events on the local day containing `now`, in display order: all-day events first (by start date, then title),
// then timed events by start, end, title and id. A timed event is on the day when it starts before the day ends and
// ends after it starts; an all-day event when its first day is on or before the day and its exclusive end is after it.
export function eventsOnDay(items: TodayEvent[], now: Date): EventRow[] {
  const { start, end } = dayBounds(now)
  const startMs = start.getTime()
  const endMs = end.getTime()
  const today = toIso(now)

  const allDay = items
    .filter((e) => e.all_day && e.starts_on !== null && e.ends_on !== null && e.starts_on <= today && today < e.ends_on)
    .sort(
      (a, b) =>
        compareText(a.starts_on!, b.starts_on!) || compareText(a.title ?? '', b.title ?? '') || compareText(a.id, b.id),
    )
    .map((event): EventRow => ({ event, label: 'All day', endsAtMs: null }))

  const timed = items
    .filter((e) => !e.all_day && e.starts_at !== null && e.ends_at !== null)
    .map((event) => ({ event, from: Date.parse(event.starts_at!), to: Date.parse(event.ends_at!) }))
    .filter(({ from, to }) => from < endMs && to > startMs)
    .sort(
      (a, b) =>
        a.from - b.from ||
        a.to - b.to ||
        compareText(a.event.title ?? '', b.event.title ?? '') ||
        compareText(a.event.id, b.event.id),
    )
    .map(({ event, from, to }): EventRow => {
      let label: string
      if (from >= startMs) label = formatClock(new Date(from))
      // Began before today: it runs through the whole day, or ends part-way through it.
      else if (to >= endMs) label = 'All day'
      else label = `Until ${formatClock(new Date(to))}`
      return { event, label, endsAtMs: to }
    })

  return [...allDay, ...timed]
}
