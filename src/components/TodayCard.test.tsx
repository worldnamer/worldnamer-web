import { QueryClient, QueryClientProvider, focusManager, useQuery } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { API_BASE, errorBody, googleCalendarHandlers, REFRESH_TOKEN, type MockConnectionStatus } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { getGoogleCalendarConnection } from '@/api/googleCalendarConnection'
import { TodayCard } from './TodayCard'

beforeEach(() => {
  clearAccessToken()
  setAccessToken(REFRESH_TOKEN)
})

afterEach(() => {
  vi.useRealTimers()
  focusManager.setFocused(undefined)
})

// A new client with TanStack Query's own defaults, so the card's options are the only thing that stops a refetch.
function renderCard() {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <TodayCard />
    </QueryClientProvider>,
  )
  return client
}

describe('TodayCard', () => {
  it('is a Today region with the same heading row and rules as the other cards', async () => {
    server.use(...googleCalendarHandlers('connected'))
    renderCard()
    await screen.findByText('Google Calendar connected.')

    const card = screen.getByRole('region', { name: 'Today' })
    expect(card).toHaveClass('w-full', 'lg:w-1/4', 'lg:order-last')
    const [heading, body] = Array.from(card.children)
    expect(heading).toHaveClass('border-b', 'border-border', 'pb-2')
    expect(body).toHaveClass('border-b', 'border-border', 'py-2')
  })

  it('shows muted "Loading calendar..." until the status arrives', async () => {
    server.use(...googleCalendarHandlers('connected'))
    renderCard()
    expect(screen.getByText('Loading calendar...')).toHaveClass('text-muted-foreground')
    await screen.findByText('Google Calendar connected.')
    expect(screen.queryByText('Loading calendar...')).not.toBeInTheDocument()
  })

  it('shows "Google Calendar connected." when connected', async () => {
    server.use(...googleCalendarHandlers('connected'))
    renderCard()
    expect(await screen.findByText('Google Calendar connected.')).toBeInTheDocument()
  })

  it('shows neither the connected line nor an error when not connected', async () => {
    server.use(...googleCalendarHandlers('not_connected'))
    renderCard()
    await vi.waitFor(() => expect(screen.queryByText('Loading calendar...')).not.toBeInTheDocument())
    expect(screen.queryByText('Google Calendar connected.')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an alert, after one request only, when the status cannot be loaded', async () => {
    let requests = 0
    server.use(
      http.get(`${API_BASE}/google_calendar_connection`, () => {
        requests += 1
        return HttpResponse.json(errorBody('internal_error', 'Something went wrong.'), { status: 500 })
      }),
    )
    renderCard()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load your calendar connection. Try reloading the page.")
    expect(requests).toBe(1)
  })

  it('sends no request when the window regains focus after the status is stale', async () => {
    let requests = 0
    server.use(
      http.get(`${API_BASE}/google_calendar_connection`, () => {
        requests += 1
        return HttpResponse.json({ google_calendar_connection: { status: 'connected' as MockConnectionStatus } })
      }),
    )
    const client = renderCard()
    await screen.findByText('Google Calendar connected.')
    expect(requests).toBe(1)

    // Move only the clock (not timers) past the 60 s staleTime, and check that the query really is stale.
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 61_000 })
    expect(client.getQueryCache().find({ queryKey: ['google_calendar_connection'] })?.isStaleByTime(60_000)).toBe(true)

    // The window loses and regains focus: the signal TanStack Query refetches stale queries on.
    act(() => focusManager.setFocused(false))
    // The refetch decision is made a moment after the signal, so the clock stays moved until act has finished.
    await act(async () => focusManager.setFocused(true))
    vi.useRealTimers()
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(requests).toBe(1)
  })

  // Guards the test above against passing for the wrong reason: the same query with the default focus behavior does
  // refetch when the same focus signal is sent after the same time has passed.
  it('control: a stale query without the opt-out refetches on focus', async () => {
    let requests = 0
    server.use(
      http.get(`${API_BASE}/google_calendar_connection`, () => {
        requests += 1
        return HttpResponse.json({ google_calendar_connection: { status: 'connected' as MockConnectionStatus } })
      }),
    )
    function Plain() {
      const { data } = useQuery({
        queryKey: ['google_calendar_connection'],
        queryFn: getGoogleCalendarConnection,
        staleTime: 60_000,
      })
      return <p>{data ?? 'loading'}</p>
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Plain />
      </QueryClientProvider>,
    )
    await screen.findByText('connected')
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 61_000 })
    act(() => focusManager.setFocused(false))
    // The refetch decision is made a moment after the signal, so the clock stays moved until act has finished.
    await act(async () => focusManager.setFocused(true))
    vi.useRealTimers()
    await vi.waitFor(() => expect(requests).toBe(2))
  })
})
