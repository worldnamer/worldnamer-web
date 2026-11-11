// The logged-in home: the Today card, the focus timer, Habits and Tasks, in page order.
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { googleCalendarHandlers, habitsHandlers, REFRESH_TOKEN, taskListsHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { LoggedInHome } from './LoggedInHome'

// The event is on this day in the test zone, America/Los_Angeles (vite.config.ts).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 1, 12, 0) })
  queryClient.clear()
  clearAccessToken()
  setAccessToken(REFRESH_TOKEN)
})

afterEach(() => {
  vi.useRealTimers()
})

it('puts the focus timer after Today and before Habits and Tasks in the page', async () => {
  server.use(...habitsHandlers([{ id: 1, name: 'Stretch' }]), ...taskListsHandlers([{ id: 1, name: 'Chores' }]), ...googleCalendarHandlers('connected', []))
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LoggedInHome />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByText('Stretch')
  await screen.findByRole('button', { name: 'Chores' })

  const order = ['Today', 'Focus timer', 'Habits', 'Tasks'].map((name) => screen.getByRole('region', { name }))
  for (let i = 0; i < order.length - 1; i++) {
    expect(order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }
})
