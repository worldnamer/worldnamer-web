import { describe, expect, it } from 'vitest'
import { formatDate, formatPeriod } from './dates'

describe('formatDate', () => {
  it('writes a year-month as a short month and year', () => {
    expect(formatDate('2016-02')).toBe('Feb 2016')
    expect(formatDate('2026-09')).toBe('Sep 2026')
  })

  it('leaves a bare year alone', () => {
    expect(formatDate('2013')).toBe('2013')
  })

  it('capitalizes present', () => {
    expect(formatDate('present')).toBe('Present')
  })
})

describe('formatPeriod', () => {
  it('joins start and end with an en dash', () => {
    expect(formatPeriod('2016-02', '2026-09')).toBe('Feb 2016 – Sep 2026')
  })
})
