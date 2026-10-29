// Habit list (web scenarios 1, 2 and 4). The component is rendered alone with the real queryClient and a mock token.
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken, clearAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, habitsHandlers, REFRESH_TOKEN } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { Habits } from './Habits'

function renderHabits() {
  return render(
    <QueryClientProvider client={queryClient}>
      <Habits />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  queryClient.clear()
  clearAccessToken()
  setAccessToken(REFRESH_TOKEN)
})

describe('Habits', () => {
  it('shows a region "Habits" with the names in API order', async () => {
    server.use(
      ...habitsHandlers([
        { id: 7, name: 'Drink water' },
        { id: 3, name: 'Stretch' },
      ]),
    )
    renderHabits()

    const region = screen.getByRole('region', { name: 'Habits' })
    const items = await within(region).findAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['Drink water', 'Stretch'])
  })

  it('shows a loading message until the list arrives', async () => {
    server.use(...habitsHandlers([{ id: 1, name: 'Stretch' }]))
    renderHabits()

    expect(screen.getByText('Loading habits...')).toBeInTheDocument()
    await screen.findByText('Stretch')
    expect(screen.queryByText('Loading habits...')).not.toBeInTheDocument()
  })

  it('shows "No habits yet." when there are none', async () => {
    server.use(...habitsHandlers([]))
    renderHabits()

    expect(await screen.findByText('No habits yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it.each([
    ['a server error', () => new HttpResponse(null, { status: 500 })],
    ['a network error', () => HttpResponse.error()],
  ])('shows the error alert after %s', async (_label, answer) => {
    server.use(http.get(`${API_BASE}/habits`, answer))
    renderHabits()

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your habits. Try reloading the page.")
    expect(screen.queryByText('No habits yet.')).not.toBeInTheDocument()
  })
})
