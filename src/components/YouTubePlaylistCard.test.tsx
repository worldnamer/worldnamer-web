import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { navigateTo } from '@/lib/externalNavigation'
import { API_BASE, CONSENT_URL, errorBody, REFRESH_TOKEN, youtubeHandlers } from '@/mocks/handlers'
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

  it('shows The connection to YouTube was lost. with Connect when lost', async () => {
    server.use(...youtubeHandlers('lost'))
    renderCard()
    await settled()
    expect(screen.getByText('The connection to YouTube was lost.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect YouTube' })).toBeInTheDocument()
  })

  it("shows YouTube wasn't connected. after a cancelled connect", async () => {
    server.use(...youtubeHandlers('not_connected'))
    renderCard('/youtube?youtube=cancelled')
    await settled()
    expect(screen.getByRole('alert')).toHaveTextContent("YouTube wasn't connected.")
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

  it('starts connecting with credentials included and goes to Google\'s address', async () => {
    const user = userEvent.setup()
    // MSW under Node always reports request.credentials as 'same-origin', so assert on what is passed to fetch itself.
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    server.use(...youtubeHandlers('not_connected'))
    renderCard()
    await settled()

    await user.click(screen.getByRole('button', { name: 'Connect YouTube' }))

    await vi.waitFor(() => expect(navigateTo).toHaveBeenCalledWith(CONSENT_URL))
    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_BASE}/youtube_connection/authorization`,
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
  })

  it('disables Connect YouTube while starting and after success', async () => {
    const user = userEvent.setup()
    // The start handler waits until the test releases it, so the pending state can be checked.
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      ...youtubeHandlers('not_connected'),
      http.post(`${API_BASE}/youtube_connection/authorization`, async () => {
        await gate
        return HttpResponse.json({ authorization_url: CONSENT_URL }, { status: 201 })
      }),
    )
    renderCard()
    await settled()

    const button = screen.getByRole('button', { name: 'Connect YouTube' })
    await user.click(button)
    expect(button).toBeDisabled()

    release()
    await vi.waitFor(() => expect(navigateTo).toHaveBeenCalledWith(CONSENT_URL))
    expect(button).toBeDisabled()
  })

  it('shows an alert and stays on the page when the start fails', async () => {
    const user = userEvent.setup()
    vi.mocked(navigateTo).mockClear()
    // Listed before the shared handlers so this answer is the one MSW uses for the start request.
    server.use(
      http.post(`${API_BASE}/youtube_connection/authorization`, () =>
        HttpResponse.json(errorBody('internal', 'x'), { status: 500 }),
      ),
      ...youtubeHandlers('not_connected'),
    )
    renderCard()
    await settled()

    await user.click(screen.getByRole('button', { name: 'Connect YouTube' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't start connecting. Try again.",
    )
    expect(navigateTo).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Connect YouTube' })).toBeEnabled()
  })

  it("shows Couldn't connect YouTube. Try again. after a failed connect", async () => {
    server.use(...youtubeHandlers('not_connected'))
    renderCard('/youtube?youtube=failed')
    await settled()
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't connect YouTube. Try again.")
  })

  it('clears the outcome message when Connect is clicked again', async () => {
    const user = userEvent.setup()
    // The start handler waits until the test releases it, so the message is checked while the start is in flight.
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      ...youtubeHandlers('not_connected'),
      http.post(`${API_BASE}/youtube_connection/authorization`, async () => {
        await gate
        return HttpResponse.json({ authorization_url: CONSENT_URL }, { status: 201 })
      }),
    )
    renderCard('/youtube?youtube=failed')
    await settled()
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't connect YouTube. Try again.")

    await user.click(screen.getByRole('button', { name: 'Connect YouTube' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    release()
    await vi.waitFor(() => expect(navigateTo).toHaveBeenCalledWith(CONSENT_URL))
  })

  it('removes the youtube parameter from the address and keeps the others', async () => {
    server.use(...youtubeHandlers('not_connected'))
    renderCard('/youtube?youtube=cancelled&keep=1')
    await settled()
    const address = screen.getByLabelText('Address')
    expect(address.textContent).toBe('/youtube?keep=1')
    expect(address).toHaveAttribute('data-navigation', 'REPLACE')
  })

  it('ignores an unknown youtube value', async () => {
    server.use(...youtubeHandlers('not_connected'))
    renderCard('/youtube?youtube=weird')
    await settled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect YouTube' })).toBeInTheDocument()
  })

  it('shows the outcome message instead of the lost line when both apply', async () => {
    server.use(...youtubeHandlers('lost'))
    renderCard('/youtube?youtube=failed')
    await settled()
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't connect YouTube. Try again.")
    expect(screen.queryByText('The connection to YouTube was lost.')).not.toBeInTheDocument()
  })
})
