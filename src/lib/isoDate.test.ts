// Local-calendar 'YYYY-MM-DD' helpers. The test run is pinned to America/Los_Angeles (vite.config.ts), so a helper
// that slips into UTC is a day off here, as it would be for a visitor on a US evening.
import { describe, expect, it } from 'vitest'
import { formatDueDate, fromIso, toIso } from './isoDate'

describe('toIso', () => {
  it('gives the local day late in the evening, when UTC is already the next day', () => {
    expect(toIso(new Date(2026, 10, 5, 23, 30))).toBe('2026-11-05')
  })

  it('gives the local day just after midnight', () => {
    expect(toIso(new Date(2026, 10, 5, 0, 5))).toBe('2026-11-05')
  })

  it('pads the month and day', () => {
    expect(toIso(new Date(2027, 0, 3))).toBe('2027-01-03')
  })
})

describe('fromIso', () => {
  it('gives local midnight of the day, not UTC midnight', () => {
    const date = fromIso('2026-11-05')
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 10, 5, 0])
  })

  it('round-trips through toIso, including the day daylight saving time ends', () => {
    for (const iso of ['2026-11-01', '2026-03-08', '2028-02-29', '1900-01-01', '9999-12-31']) {
      expect(toIso(fromIso(iso))).toBe(iso)
    }
  })

  it('adds days across the end of daylight saving time and a year boundary', () => {
    expect(toIso(fromIso('2026-10-31', 1))).toBe('2026-11-01')
    expect(toIso(fromIso('2026-10-31', 2))).toBe('2026-11-02')
    expect(toIso(fromIso('2026-12-31', 1))).toBe('2027-01-01')
  })
})

describe('formatDueDate', () => {
  it.each([
    ['2026-11-05', 2026, 'Nov 5'],
    ['2026-01-01', 2026, 'Jan 1'],
    ['2026-12-31', 2026, 'Dec 31'],
    ['2027-11-05', 2026, 'Nov 5, 2027'],
    ['2025-12-31', 2026, 'Dec 31, 2025'],
  ])('shows %s in %i as "%s"', (iso, currentYear, expected) => {
    expect(formatDueDate(iso, currentYear)).toBe(expected)
  })
})
