// Logging in on a reload mounts the habit grid while the header still shows the pending session. The grid starts its
// week query during that render, so the header must not hear about it (it only cares about the session) or React
// warns that Header was updated while Habits was rendering.
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { setSessionFlag } from '@/auth/sessionFlag'
import { clearAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { googleCalendarHandlers, habitsHandlers, refreshHandler, taskListsHandlers, tasksHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'

beforeEach(() => {
  queryClient.clear()
  clearAccessToken()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  queryClient.clear()
})

it("shows the habit grid, the task lists and the first list's tasks after a reload without React warning about a state update during render", async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  setSessionFlag()
  server.use(
    refreshHandler,
    ...habitsHandlers([{ id: 1, name: 'Stretch' }]),
    ...googleCalendarHandlers(),
    ...taskListsHandlers([{ id: 1, name: 'Chores' }]),
    ...tasksHandlers({ 1: [{ id: 1, text: 'Sweep', done: false }] }),
  )

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByText('Stretch')
  await screen.findByRole('button', { name: 'Chores' })
  await screen.findByText('Sweep')

  expect(consoleError).not.toHaveBeenCalled()
})
