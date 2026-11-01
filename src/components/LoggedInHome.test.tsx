// The logged-in home: the Today card, and a column with the Habits card above the Tasks card, at the same width and with
// the same rules.
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { googleCalendarHandlers, habitsHandlers, REFRESH_TOKEN, taskListsHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { LoggedInHome } from './LoggedInHome'

beforeEach(() => {
  queryClient.clear()
  clearAccessToken()
  setAccessToken(REFRESH_TOKEN)
})

it('puts Tasks below Habits, at the same width, with the same rules, and a gap equal to the top padding', async () => {
  server.use(
    ...habitsHandlers([{ id: 1, name: 'Stretch' }]),
    ...taskListsHandlers([{ id: 1, name: 'Chores' }]),
    ...googleCalendarHandlers('connected'),
  )
  render(
    <QueryClientProvider client={queryClient}>
      <LoggedInHome />
    </QueryClientProvider>,
  )
  await screen.findByText('Stretch')
  await screen.findByRole('button', { name: 'Chores' })
  await screen.findByText('Google Calendar connected.')

  const habits = screen.getByRole('region', { name: 'Habits' })
  const tasks = screen.getByRole('region', { name: 'Tasks' })
  expect(habits.compareDocumentPosition(tasks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

  for (const card of [habits, tasks]) {
    expect(card).toHaveClass('w-full')
    // The rule under the heading row and the rule along the bottom edge.
    const [heading, body] = Array.from(card.children)
    expect(heading).toHaveClass('border-b', 'border-border', 'pb-2')
    expect(body).toHaveClass('border-b', 'border-border', 'py-2')
  }

  // Layout's <main> has pt-4 sm:pt-6 above Habits; the same goes between the cards.
  expect(tasks.parentElement).toHaveClass('mt-4', 'sm:mt-6')

  // The column holds Habits above Tasks at half the width on desktop.
  expect(habits.parentElement).toHaveClass('w-full', 'lg:w-1/2')
  expect(tasks.closest('.lg\\:w-1\\/2')).toBe(habits.parentElement)
})

it('puts the Today card first in the page and the cards in a row from lg, with the same gap as the top padding', async () => {
  server.use(...habitsHandlers(), ...taskListsHandlers(), ...googleCalendarHandlers('connected'))
  render(
    <QueryClientProvider client={queryClient}>
      <LoggedInHome />
    </QueryClientProvider>,
  )
  await screen.findByText('Google Calendar connected.')

  const home = screen.getByRole('region', { name: 'Logged-in home' })
  expect(home).toHaveClass('flex', 'flex-col', 'gap-4', 'sm:gap-6', 'lg:flex-row', 'lg:items-start')
  const today = screen.getByRole('region', { name: 'Today' })
  expect(home.firstElementChild).toBe(today)
  expect(today).toHaveClass('w-full', 'lg:w-1/4', 'lg:order-last')
})
