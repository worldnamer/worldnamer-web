import { describe, expect, it } from 'vitest'
import { FADE_MS, GAP_MS, MS_PER_CHAR, scheduleLines } from './dossier'

describe('scheduleLines', () => {
  it('starts each line after the one before it', () => {
    const [first, second] = scheduleLines([
      { text: 'abcd', typed: true },
      { text: 'xy', typed: true },
    ])

    expect(first).toEqual({ delay: 0, duration: 4 * MS_PER_CHAR, length: 4 })
    expect(second.delay).toBe(4 * MS_PER_CHAR + GAP_MS)
  })

  it('fades long lines in for a fixed time instead of typing them', () => {
    const [fade, after] = scheduleLines([
      { text: 'a very long line that would wrap on a phone', typed: false },
      { text: 'next', typed: true },
    ])

    expect(fade.duration).toBe(FADE_MS)
    expect(after.delay).toBe(FADE_MS + GAP_MS)
  })

  it('keeps the whole reveal under three seconds for the real content length', () => {
    const lines = Array.from({ length: 10 }, () => ({ text: 'x'.repeat(16), typed: true }))
    const last = scheduleLines(lines).at(-1)!

    expect(last.delay + last.duration).toBeLessThan(3000)
  })
})
