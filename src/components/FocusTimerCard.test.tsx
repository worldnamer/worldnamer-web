import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FOCUS_LENGTHS_KEY } from '@/lib/focusLengths'
import { FocusTimerCard } from './FocusTimerCard'

beforeEach(() => localStorage.clear())

const minutesOf = (label: string) => screen.getByRole('button', { name: `${label} minutes up` }).parentElement!.querySelector('.tabular-nums')!.textContent

it('starts at 15, 5 and 15 minutes', () => {
  render(<FocusTimerCard />)
  expect(minutesOf('Work')).toBe('15')
  expect(minutesOf('Break')).toBe('5')
  expect(minutesOf('Long break')).toBe('15')
})

it('steps by 5 with the arrows and keeps the value for the next visit', async () => {
  const user = userEvent.setup()
  const { unmount } = render(<FocusTimerCard />)
  await user.click(screen.getByRole('button', { name: 'Work minutes up' }))
  await user.click(screen.getByRole('button', { name: 'Break minutes up' }))
  await user.click(screen.getByRole('button', { name: 'Long break minutes down' }))
  expect(minutesOf('Work')).toBe('20')
  expect(JSON.parse(localStorage.getItem(FOCUS_LENGTHS_KEY)!)).toEqual({ work: 20, break: 10, longBreak: 10 })
  unmount()

  render(<FocusTimerCard />)
  expect(minutesOf('Work')).toBe('20')
  expect(minutesOf('Break')).toBe('10')
  expect(minutesOf('Long break')).toBe('10')
})

it('dims the down arrow at 5 and the up arrow at 60', async () => {
  localStorage.setItem(FOCUS_LENGTHS_KEY, JSON.stringify({ work: 60, break: 5, longBreak: 15 }))
  render(<FocusTimerCard />)
  expect(screen.getByRole('button', { name: 'Work minutes up' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Work minutes down' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Break minutes down' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Break minutes up' })).toBeEnabled()
})

it('falls back to the defaults for bad saved data', () => {
  localStorage.setItem(FOCUS_LENGTHS_KEY, '{broken')
  render(<FocusTimerCard />)
  expect(minutesOf('Work')).toBe('15')
})

// The running cycle uses the real clock functions, which vitest fakes here, so no test waits in real time.
describe('running a cycle', () => {
  const MIN = 60_000
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 10, 1, 12, 0) })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const passTime = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
  const bar = () => screen.getByRole('progressbar')
  const start = () => act(() => screen.getByRole('button', { name: 'Start' }).click())

  it('runs through all six sections, holding each until Start, then returns to the pickers', () => {
    localStorage.setItem(FOCUS_LENGTHS_KEY, JSON.stringify({ work: 25, break: 5, longBreak: 20 }))
    render(<FocusTimerCard />)
    start()
    expect(bar()).toHaveAccessibleName('Work, 25:00 left')
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()

    passTime(10 * MIN)
    expect(bar()).toHaveAccessibleName('Work, 15:00 left')

    const expected = [
      ['Break', '5:00'],
      ['Work', '25:00'],
      ['Break', '5:00'],
      ['Work', '25:00'],
      ['Long break', '20:00'],
    ]
    let remainingInPhase = 15 * MIN
    for (const [name, full] of expected) {
      passTime(remainingInPhase)
      // Held: the next phase at its full length, and it stays there however long it waits.
      expect(bar()).toHaveAccessibleName(`${name}, ${full} left, ready to start`)
      passTime(30 * MIN)
      expect(bar()).toHaveAccessibleName(`${name}, ${full} left, ready to start`)
      start()
      expect(bar()).toHaveAccessibleName(`${name}, ${full} left`)
      remainingInPhase = { Break: 5, Work: 25, 'Long break': 20 }[name]! * MIN
    }
    passTime(remainingInPhase)
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Work minutes up' })).toBeInTheDocument()
  })

  it('shows the right phase and time after the clock jumps, as in a throttled background tab', () => {
    localStorage.setItem(FOCUS_LENGTHS_KEY, JSON.stringify({ work: 25, break: 5, longBreak: 20 }))
    render(<FocusTimerCard />)
    start()
    // No tick runs for 40 minutes, then one does: Work is over and Break waits, full, rather than having counted down.
    act(() => {
      vi.setSystemTime(Date.now() + 40 * MIN)
      vi.advanceTimersByTime(250)
    })
    expect(bar()).toHaveAccessibleName('Break, 5:00 left, ready to start')
    start()
    act(() => {
      vi.setSystemTime(Date.now() + 3 * MIN)
      vi.advanceTimersByTime(250)
    })
    // 3 minutes and a tick of 5 have passed, leaving 1:59.75, which is shown rounded up.
    expect(bar()).toHaveAccessibleName('Break, 2:00 left')
  })

  it('marks finished sections solid and later ones outlined', () => {
    render(<FocusTimerCard />)
    start()
    passTime(15 * MIN)
    start()
    const items = within(screen.getByRole('list', { name: 'Focus cycle' })).getAllByRole('listitem')
    expect(items).toHaveLength(6)
    expect(items[0]).toHaveTextContent('Work, done')
    expect(items[0].querySelector('svg')).toHaveAttribute('fill', 'currentColor')
    expect(items[2]).toHaveTextContent('Work, coming up')
    expect(items[2].querySelector('svg')).toHaveAttribute('fill', 'none')
  })

  it('clears its interval when the card goes away', () => {
    const { unmount } = render(<FocusTimerCard />)
    start()
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
