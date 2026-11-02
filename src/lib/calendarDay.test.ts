import { describe, expect, it } from 'vitest'
import type { TodayEvent } from '@/api/googleCalendarConnection'
import { allDayEvent, timedEvent } from '@/mocks/handlers'
import { dayBounds, eventsOnDay } from './calendarDay'

// The tests run in America/Los_Angeles (vite.config.ts). 2026-11-01 is the day clocks go back there, so it is 25 hours
// long (-07:00 until 02:00, then -08:00); 2026-03-08 is the day they go forward, 23 hours long.
const NOV_1_NOON = new Date(2026, 10, 1, 12, 0)

const ids = (rows: { event: TodayEvent }[]) => rows.map((r) => r.event.id)

describe('the test zone', () => {
  it('is not UTC and observes daylight saving time', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(new Date(2026, 6, 1).getTimezoneOffset())
  })
})

describe('dayBounds', () => {
  it('runs from local midnight to the next local midnight', () => {
    const { start, end } = dayBounds(new Date(2026, 5, 10, 15, 30))
    expect(start).toEqual(new Date(2026, 5, 10, 0, 0))
    expect(end).toEqual(new Date(2026, 5, 11, 0, 0))
  })

  it('is 25 hours long on the day daylight saving time ends', () => {
    const { start, end } = dayBounds(NOV_1_NOON)
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25)
  })

  it('is 23 hours long on the day daylight saving time starts', () => {
    const { start, end } = dayBounds(new Date(2026, 2, 8, 12, 0))
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23)
  })
})

describe('eventsOnDay', () => {
  it('puts all-day events first, then timed events by start, with their labels', () => {
    const rows = eventsOnDay(
      [
        timedEvent('late', 'Dinner', '2026-11-01T18:30:00-08:00', '2026-11-01T20:00:00-08:00'),
        allDayEvent('holiday', 'Holiday', '2026-11-01', '2026-11-02'),
        timedEvent('early', 'Dentist', '2026-11-01T09:00:00-08:00', '2026-11-01T10:00:00-08:00'),
      ],
      NOV_1_NOON,
    )
    expect(ids(rows)).toEqual(['holiday', 'early', 'late'])
    expect(rows.map((r) => r.label)).toEqual(['All day', expect.stringMatching(/^9:00\sAM$/), expect.stringMatching(/^6:30\sPM$/)])
  })

  it('shows the instant in the local zone, whatever offset it arrived with', () => {
    // 17:00 UTC is 9:00 in Los Angeles (PST after 2 AM today) on this day.
    const [row] = eventsOnDay([timedEvent('a', 'Call', '2026-11-01T17:00:00Z', '2026-11-01T18:00:00Z')], NOV_1_NOON)
    expect(row.label).toMatch(/^9:00\sAM$/)
  })

  it('reads "Until" for an event from yesterday that ends today', () => {
    const [row] = eventsOnDay([timedEvent('a', 'Flight', '2026-10-31T22:00:00-07:00', '2026-11-01T02:00:00-08:00')], NOV_1_NOON)
    expect(row.label).toMatch(/^Until 2:00\sAM$/)
  })

  it('reads "All day" for a timed event that began before today and ends after it', () => {
    const [row] = eventsOnDay([timedEvent('a', 'Conference', '2026-10-31T09:00:00-07:00', '2026-11-02T17:00:00-08:00')], NOV_1_NOON)
    expect(row.label).toBe('All day')
  })

  it('treats an event that ends exactly at the end of the day as running through it', () => {
    const [row] = eventsOnDay([timedEvent('a', 'Overnight', '2026-10-31T20:00:00-07:00', '2026-11-02T00:00:00-08:00')], NOV_1_NOON)
    expect(row.label).toBe('All day')
  })

  it('leaves out an event that ended at midnight, and one that starts at the next midnight', () => {
    const rows = eventsOnDay(
      [
        timedEvent('before', 'Late', '2026-10-31T22:00:00-07:00', '2026-11-01T00:00:00-07:00'),
        timedEvent('after', 'Early', '2026-11-02T00:00:00-08:00', '2026-11-02T01:00:00-08:00'),
      ],
      NOV_1_NOON,
    )
    expect(rows).toEqual([])
  })

  it('keeps an event at 11 PM on the 25-hour day, and one at 1 AM that happens twice', () => {
    const rows = eventsOnDay(
      [
        timedEvent('first-1am', 'First', '2026-11-01T01:30:00-07:00', '2026-11-01T01:45:00-07:00'),
        timedEvent('second-1am', 'Second', '2026-11-01T01:10:00-08:00', '2026-11-01T01:20:00-08:00'),
        timedEvent('last', 'Last', '2026-11-01T23:30:00-08:00', '2026-11-01T23:59:00-08:00'),
      ],
      NOV_1_NOON,
    )
    expect(ids(rows)).toEqual(['first-1am', 'second-1am', 'last'])
  })

  it('keeps the whole 23-hour day on the day daylight saving time starts', () => {
    const rows = eventsOnDay(
      [
        timedEvent('in', 'Late', '2026-03-08T23:30:00-07:00', '2026-03-08T23:45:00-07:00'),
        timedEvent('out', 'Next', '2026-03-09T00:00:00-07:00', '2026-03-09T01:00:00-07:00'),
      ],
      new Date(2026, 2, 8, 12, 0),
    )
    expect(ids(rows)).toEqual(['in'])
  })

  it('includes an all-day event that starts today and a multi-day one on a middle day', () => {
    const rows = eventsOnDay(
      [allDayEvent('trip', 'Trip', '2026-10-30', '2026-11-04'), allDayEvent('today', 'Today only', '2026-11-01', '2026-11-02')],
      NOV_1_NOON,
    )
    expect(ids(rows)).toEqual(['trip', 'today'])
  })

  it('leaves out an all-day event that ended today (the end is exclusive) or starts tomorrow', () => {
    const rows = eventsOnDay(
      [allDayEvent('ended', 'Ended', '2026-10-30', '2026-11-01'), allDayEvent('next', 'Next', '2026-11-02', '2026-11-03')],
      NOV_1_NOON,
    )
    expect(rows).toEqual([])
  })

  it('orders all-day events by start date, then title; timed events by start, end, title, then id', () => {
    const rows = eventsOnDay(
      [
        allDayEvent('d', 'Beta', '2026-11-01', '2026-11-02'),
        allDayEvent('c', 'Alpha', '2026-11-01', '2026-11-02'),
        allDayEvent('b', 'Zed', '2026-10-31', '2026-11-02'),
        timedEvent('t4', 'Same', '2026-11-01T10:00:00-07:00', '2026-11-01T11:00:00-07:00'),
        timedEvent('t3', 'Same', '2026-11-01T10:00:00-07:00', '2026-11-01T10:30:00-07:00'),
        timedEvent('t2', 'Beta', '2026-11-01T10:00:00-07:00', '2026-11-01T10:30:00-07:00'),
        timedEvent('t1b', 'Alpha', '2026-11-01T10:00:00-07:00', '2026-11-01T10:30:00-07:00'),
        timedEvent('t1a', 'Alpha', '2026-11-01T10:00:00-07:00', '2026-11-01T10:30:00-07:00'),
        timedEvent('t0', 'Early', '2026-11-01T08:00:00-07:00', '2026-11-01T09:00:00-07:00'),
      ],
      NOV_1_NOON,
    )
    expect(ids(rows)).toEqual(['b', 'c', 'd', 't0', 't1a', 't1b', 't2', 't3', 't4'])
  })

  it('sorts by the instant, not by the text of the offset', () => {
    // 09:00-08:00 is 17:00 UTC; 10:00-07:00 is also 17:00 UTC, so the id decides; 08:30-07:00 is earlier.
    const rows = eventsOnDay(
      [
        timedEvent('b', 'X', '2026-11-01T09:00:00-08:00', '2026-11-01T09:30:00-08:00'),
        timedEvent('a', 'X', '2026-11-01T10:00:00-07:00', '2026-11-01T10:30:00-07:00'),
        timedEvent('z', 'X', '2026-11-01T08:30:00-07:00', '2026-11-01T09:00:00-07:00'),
      ],
      NOV_1_NOON,
    )
    expect(ids(rows)).toEqual(['z', 'a', 'b'])
  })

  it('reports when a timed event ends, and nothing for an all-day one', () => {
    const rows = eventsOnDay(
      [allDayEvent('a', 'A', '2026-11-01', '2026-11-02'), timedEvent('t', 'T', '2026-11-01T09:00:00-07:00', '2026-11-01T10:00:00-07:00')],
      NOV_1_NOON,
    )
    expect(rows[0].endsAtMs).toBeNull()
    expect(rows[1].endsAtMs).toBe(Date.parse('2026-11-01T10:00:00-07:00'))
  })
})
