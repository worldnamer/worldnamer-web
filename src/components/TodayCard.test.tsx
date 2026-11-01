import { QueryClient, QueryClientProvider, focusManager, useQuery } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { API_BASE, CONSENT_URL, errorBody, googleCalendarHandlers, REFRESH_TOKEN, type MockConnectionStatus } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { getGoogleCalendarConnection } from '@/api/googleCalendarConnection'
import { navigateTo } from '@/lib/externalNavigation'
import { TodayCard } from './TodayCard'

vi.mock('@/lib/externalNavigation', () => ({ navigateTo: vi.fn() }))

beforeEach(() => {
  clearAccessToken()
  setAccessToken(REFRESH_TOKEN)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(navigateTo).mockClear()
  vi.useRealTimers()
  focusManager.setFocused(undefined)
})

// A new client with TanStack Query's own defaults, so the card's options are the only thing that stops a refetch.
function renderCard(address = '/') {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[address]}>
        <TodayCard />
        <Address />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
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

  it('shows the Connect button, and neither the connected line nor an error, when not connected', async () => {
    server.use(...googleCalendarHandlers('not_connected'))
    renderCard()
    expect(await screen.findByRole('button', { name: 'Connect Google Calendar' })).toBeEnabled()
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

  it('does not show the Connect button when connected', async () => {
    server.use(...googleCalendarHandlers('connected'))
    renderCard()
    await screen.findByText('Google Calendar connected.')
    expect(screen.queryByRole('button', { name: 'Connect Google Calendar' })).not.toBeInTheDocument()
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

  describe('Connect', () => {
    it("starts the flow with credentials: 'include', navigates to the returned address and stays disabled", async () => {
      const user = userEvent.setup()
      // MSW under Node always reports request.credentials as 'same-origin', so assert on what is passed to fetch itself.
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      let starts = 0
      server.use(
        http.post(`${API_BASE}/google_calendar_connection/authorization`, () => {
          starts += 1
          return HttpResponse.json({ authorization_url: CONSENT_URL }, { status: 201 })
        }),
        ...googleCalendarHandlers('not_connected'),
      )
      renderCard()
      const button = await screen.findByRole('button', { name: 'Connect Google Calendar' })
      await user.click(button)

      await vi.waitFor(() => expect(navigateTo).toHaveBeenCalledWith(CONSENT_URL))
      expect(fetchSpy).toHaveBeenCalledWith(
        `${API_BASE}/google_calendar_connection/authorization`,
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      )
      expect(navigateTo).toHaveBeenCalledTimes(1)
      expect(button).toBeDisabled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(starts).toBe(1)
    })

    it('is disabled while the request is out', async () => {
      const user = userEvent.setup()
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      server.use(
        http.post(`${API_BASE}/google_calendar_connection/authorization`, async () => {
          await held
          return HttpResponse.json({ authorization_url: CONSENT_URL }, { status: 201 })
        }),
        ...googleCalendarHandlers('not_connected'),
      )
      renderCard()
      const button = await screen.findByRole('button', { name: 'Connect Google Calendar' })
      await user.click(button)
      expect(button).toBeDisabled()
      release()
      await vi.waitFor(() => expect(navigateTo).toHaveBeenCalled())
    })

    it('shows an alert and does not navigate when the start fails, and can be tried again', async () => {
      const user = userEvent.setup()
      server.use(
        http.post(`${API_BASE}/google_calendar_connection/authorization`, () =>
          HttpResponse.json(errorBody('internal_error', 'Something went wrong.'), { status: 500 }),
        ),
        ...googleCalendarHandlers('not_connected'),
      )
      renderCard()
      const button = await screen.findByRole('button', { name: 'Connect Google Calendar' })
      await user.click(button)

      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't start connecting. Try again.")
      expect(navigateTo).not.toHaveBeenCalled()
      expect(button).toBeEnabled()
    })

    it('clears the start error when Connect is clicked again', async () => {
      const user = userEvent.setup()
      let attempts = 0
      server.use(
        http.post(`${API_BASE}/google_calendar_connection/authorization`, () => {
          attempts += 1
          if (attempts === 1) return HttpResponse.json(errorBody('internal_error', 'Nope.'), { status: 500 })
          return HttpResponse.json({ authorization_url: CONSENT_URL }, { status: 201 })
        }),
        ...googleCalendarHandlers('not_connected'),
      )
      renderCard()
      const button = await screen.findByRole('button', { name: 'Connect Google Calendar' })
      await user.click(button)
      await screen.findByRole('alert')
      await user.click(button)

      await vi.waitFor(() => expect(navigateTo).toHaveBeenCalledWith(CONSENT_URL))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('outcome of connecting', () => {
    const address = () => screen.getByLabelText('Address')

    it.each([
      ['cancelled', "Google Calendar wasn't connected."],
      ['failed', "Couldn't connect Google Calendar. Try again."],
    ])('shows the message for ?google_calendar=%s, offers Connect and removes the parameter', async (value, message) => {
      server.use(...googleCalendarHandlers('not_connected'))
      renderCard(`/?google_calendar=${value}`)

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(await screen.findByRole('button', { name: 'Connect Google Calendar' })).toBeEnabled()
      expect(address()).toHaveTextContent(/^\/$/)
      // The message is kept after the address is cleaned.
      expect(screen.getByRole('alert')).toHaveTextContent(message)
    })

    it('shows no message for ?google_calendar=connected, and removes the parameter', async () => {
      server.use(...googleCalendarHandlers('connected'))
      renderCard('/?google_calendar=connected')

      await screen.findByText('Google Calendar connected.')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(address()).toHaveTextContent(/^\/$/)
    })

    it('ignores an unknown value, and still removes the parameter', async () => {
      server.use(...googleCalendarHandlers('not_connected'))
      renderCard('/?google_calendar=<b>hello</b>')

      await screen.findByRole('button', { name: 'Connect Google Calendar' })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByText('hello')).not.toBeInTheDocument()
      expect(address()).toHaveTextContent(/^\/$/)
    })

    it('leaves other parameters in the address', async () => {
      server.use(...googleCalendarHandlers('not_connected'))
      renderCard('/?a=1&google_calendar=failed&b=2')

      await screen.findByRole('alert')
      expect(address()).toHaveTextContent('/?a=1&b=2')
    })

    it('replaces the history entry instead of adding one', async () => {
      server.use(...googleCalendarHandlers('not_connected'))
      renderCard('/?google_calendar=failed')
      await screen.findByRole('alert')
      expect(address()).toHaveAttribute('data-navigation', 'REPLACE')
    })

    it('takes the message away when Connect is clicked again', async () => {
      const user = userEvent.setup()
      server.use(...googleCalendarHandlers('not_connected'))
      renderCard('/?google_calendar=failed')
      await screen.findByRole('alert')
      await user.click(await screen.findByRole('button', { name: 'Connect Google Calendar' }))

      await vi.waitFor(() => expect(navigateTo).toHaveBeenCalled())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('lost connection', () => {
    it('shows the lost line with the Connect button', async () => {
      server.use(...googleCalendarHandlers('lost'))
      renderCard()

      expect(await screen.findByText('The connection to Google Calendar was lost.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Connect Google Calendar' })).toBeEnabled()
      expect(screen.queryByText('Google Calendar connected.')).not.toBeInTheDocument()
    })

    it.each(['not_connected', 'connected'] as const)('does not show the lost line when %s', async (status) => {
      server.use(...googleCalendarHandlers(status))
      renderCard()
      await vi.waitFor(() => expect(screen.queryByText('Loading calendar...')).not.toBeInTheDocument())
      expect(screen.queryByText('The connection to Google Calendar was lost.')).not.toBeInTheDocument()
    })

    it('lets an outcome message replace the lost line', async () => {
      server.use(...googleCalendarHandlers('lost'))
      renderCard('/?google_calendar=failed')

      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't connect Google Calendar. Try again.")
      await screen.findByRole('button', { name: 'Connect Google Calendar' })
      expect(screen.queryByText('The connection to Google Calendar was lost.')).not.toBeInTheDocument()
    })
  })
})
