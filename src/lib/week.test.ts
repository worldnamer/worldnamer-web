// Local-calendar week helpers. The test run is pinned to America/Los_Angeles (vite.config.ts), so a helper that
// slips into UTC is a day off here, as it would be for a visitor on a US evening.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addWeeks,
  currentWeekStart,
  formatDayHeader,
  formatDayLabel,
  formatWeekRange,
  today,
  weekDays,
  weekStartOf,
} from './week'

afterEach(() => {
  vi.useRealTimers()
})

describe('the test time zone', () => {
  it('is not UTC, so the time zone tests cannot pass by accident', () => {
    expect(new Date(2026, 9, 29).getTimezoneOffset()).not.toBe(0)
  })

  it('is Los Angeles, whose daylight saving time ends on Sunday 2026-11-01', () => {
    expect(new Date(2026, 9, 31, 12).getTimezoneOffset()).toBe(420) // PDT, UTC-7
    expect(new Date(2026, 10, 1, 12).getTimezoneOffset()).toBe(480) // PST, UTC-8
  })
})

describe('weekStartOf', () => {
  it.each([
    ['Monday', new Date(2026, 9, 26, 0, 0)],
    ['Tuesday', new Date(2026, 9, 27, 12, 0)],
    ['Wednesday', new Date(2026, 9, 28, 23, 59)],
    ['Thursday', new Date(2026, 9, 29, 10, 0)],
    ['Friday', new Date(2026, 9, 30, 17, 0)],
    ['Saturday', new Date(2026, 9, 31, 20, 0)],
    ['Sunday before the clocks go back', new Date(2026, 10, 1, 0, 30)],
    ['Sunday after the clocks go back', new Date(2026, 10, 1, 23, 30)],
  ])('gives the Monday for a %s in the daylight saving week', (_label, date) => {
    expect(weekStartOf(date)).toBe('2026-10-26')
  })

  it('starts a new week on Monday just after midnight', () => {
    expect(weekStartOf(new Date(2026, 10, 2, 0, 5))).toBe('2026-11-02')
  })

  it('goes back across a month boundary', () => {
    expect(weekStartOf(new Date(2026, 7, 1, 9, 0))).toBe('2026-07-27') // Saturday 1 August
  })

  it('goes back across a year boundary', () => {
    expect(weekStartOf(new Date(2027, 0, 1, 21, 0))).toBe('2026-12-28') // Friday 1 January
  })
})

describe('addWeeks', () => {
  it('moves forward a week across the end of daylight saving time', () => {
    expect(addWeeks('2026-10-26', 1)).toBe('2026-11-02')
  })

  it('moves forward a week across the start of daylight saving time', () => {
    expect(addWeeks('2027-03-08', 1)).toBe('2027-03-15')
  })

  it('moves back across a year boundary', () => {
    expect(addWeeks('2027-01-04', -1)).toBe('2026-12-28')
  })
})

describe('weekDays', () => {
  it('lists the seven days from Monday to Sunday', () => {
    expect(weekDays('2026-10-26')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ])
  })

  it('crosses into the next year', () => {
    expect(weekDays('2026-12-28').slice(3)).toEqual(['2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
  })
})

describe('today and currentWeekStart', () => {
  it('read the local date late on a Sunday evening, when UTC is already Monday', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 1, 23, 30))
    expect(today()).toBe('2026-11-01')
    expect(currentWeekStart()).toBe('2026-10-26')
  })

  it('move to the new week just after midnight on Monday', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 2, 0, 5))
    expect(today()).toBe('2026-11-02')
    expect(currentWeekStart()).toBe('2026-11-02')
  })
})

describe('formatWeekRange', () => {
  it.each([
    ['2026-10-26', 2026, 'Oct 26 – Nov 1'],
    ['2026-11-02', 2026, 'Nov 2 – Nov 8'],
    ['2026-12-28', 2026, 'Dec 28 – Jan 3, 2027'],
    ['2025-10-27', 2026, 'Oct 27 – Nov 2, 2025'],
    ['2025-12-29', 2026, 'Dec 29 – Jan 4, 2026'],
    ['2027-01-04', 2027, 'Jan 4 – Jan 10'],
  ])('shows the week of %s in %i as "%s"', (weekStart, currentYear, expected) => {
    expect(formatWeekRange(weekStart, currentYear)).toBe(expected)
  })
})

describe('day formats', () => {
  it('names the column by its short weekday', () => {
    expect(weekDays('2026-10-26').map(formatDayHeader)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  })

  it('spells out the day for a checkbox label', () => {
    expect(formatDayLabel('2026-10-26')).toBe('Monday, October 26')
    expect(formatDayLabel('2026-11-01')).toBe('Sunday, November 1')
  })
})
