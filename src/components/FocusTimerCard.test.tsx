import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it } from 'vitest'
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
