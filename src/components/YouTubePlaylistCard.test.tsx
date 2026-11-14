import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { API_BASE, errorBody, REFRESH_TOKEN, youtubeHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { YouTubePlaylistCard } from './YouTubePlaylistCard'

vi.mock('@/lib/externalNavigation', () => ({ navigateTo: vi.fn() }))

beforeEach(() => {
  clearAccessToken()
  setAccessToken(REFRESH_TOKEN)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  focusManager.setFocused(undefined)
})

// A new client with TanStack Query's own defaults, as the Today card's tests use.
function renderCard(address = '/') {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[address]}>
        <YouTubePlaylistCard />
        <Address />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Shows the router's current address, so a test can see what the card did to the URL.
function Address() {
  const { pathname, search } = useLocation()
  return (
    <output aria-label="Address" data-navigation={useNavigationType()}>
      {pathname + search}
    </output>
  )
}

// Waits until the first answer has been drawn, whatever it was.
async function settled() {
  await vi.waitFor(() => expect(screen.queryByText('Loading YouTube...')).not.toBeInTheDocument())
}

describe('YouTubePlaylistCard', () => {
  it('shows Loading YouTube... while the connection loads', async () => {
    server.use(...youtubeHandlers('connected'))
    renderCard()
    expect(screen.getByText('Loading YouTube...')).toBeInTheDocument()
    await settled()
  })

  it('shows an alert when the connection cannot be loaded', async () => {
    server.use(
      http.get(`${API_BASE}/youtube_connection`, () =>
        HttpResponse.json(errorBody('internal', 'x'), { status: 500 }),
      ),
    )
    renderCard()
    await settled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't load your YouTube connection. Try reloading the page.",
    )
  })

  it('offers Connect YouTube when not connected', async () => {
    server.use(...youtubeHandlers('not_connected'))
    renderCard()
    await settled()
    expect(screen.getByRole('button', { name: 'Connect YouTube' })).toBeInTheDocument()
  })

  it('says YouTube connected. when connected', async () => {
    server.use(...youtubeHandlers('connected'))
    renderCard()
    await settled()
    expect(screen.getByText('YouTube connected.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect YouTube' })).not.toBeInTheDocument()
  })

  it('sends no request when the window regains focus after the data is stale', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 1, 12, 0) })
    let requests = 0
    server.use(
      http.get(`${API_BASE}/youtube_connection`, () => {
        requests += 1
        return HttpResponse.json({ youtube_connection: { status: 'connected', playlist: null } })
      }),
      ...youtubeHandlers('connected'),
    )
    renderCard()
    await settled()
    expect(requests).toBe(1)

    // Move only the clock past the 60 s staleTime.
    vi.setSystemTime(Date.now() + 61_000)

    // The window loses and regains focus: the signal TanStack Query refetches stale queries on.
    act(() => focusManager.setFocused(false))
    // The refetch decision is made a moment after the signal, so the clock stays moved until act has finished.
    await act(async () => focusManager.setFocused(true))
    vi.useRealTimers()
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(requests).toBe(1)
  })
})
