import { QueryClient, QueryClientProvider, focusManager, useQuery } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { allDayEvent, API_BASE, CONSENT_URL, errorBody, eventsBody, googleCalendarHandlers, REFRESH_TOKEN, timedEvent } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { getTodayEvents } from '@/api/googleCalendarConnection'
import { navigateTo } from '@/lib/externalNavigation'
import { TODAY_REFRESH_MS, TodayCard } from './TodayCard'

vi.mock('@/lib/externalNavigation', () => ({ navigateTo: vi.fn() }))

// The browser zone is America/Los_Angeles (vite.config.ts). On this day clocks go back at 2 AM, so it is 25 hours long.
const NOW = new Date(2026, 10, 1, 12, 0)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
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

// Waits until the first answer has been drawn, whatever it was.
async function settled() {
  await vi.waitFor(() => expect(screen.queryByText('Loading calendar...')).not.toBeInTheDocument())
}

describe('TodayCard', () => {
  it('is a Today region with the same heading row and rules as the other cards', async () => {
    server.use(...googleCalendarHandlers('connected'))
    renderCard()
    await settled()

    const card = screen.getByRole('region', { name: 'Today' })
    expect(card).toHaveClass('w-full', 'lg:w-1/4', 'lg:order-last')
    const [heading, body] = Array.from(card.children)
    expect(heading).toHaveClass('border-b', 'border-border', 'pb-2')
    expect(body).toHaveClass('border-b', 'border-border', 'py-2')
  })

  it('never calls the status endpoint', async () => {
    let statusCalls = 0
    server.use(
      ...googleCalendarHandlers('connected'),
      http.get(`${API_BASE}/google_calendar_connection`, () => {
        statusCalls += 1
        return HttpResponse.json({ google_calendar_connection: { status: 'connected' } })
      }),
    )
    renderCard()
    await settled()
    expect(statusCalls).toBe(0)
  })

  it('shows muted "Loading calendar..." until the events arrive', async () => {
    server.use(...googleCalendarHandlers('connected'))
    renderCard()
    expect(screen.getByText('Loading calendar...')).toHaveClass('text-muted-foreground')
    await settled()
    expect(screen.queryByText('Loading calendar...')).not.toBeInTheDocument()
  })

  it('lists today\'s events, all-day first, with their labels', async () => {
    server.use(
      ...googleCalendarHandlers('connected', [
        timedEvent('t2', 'Dinner', '2026-11-01T18:30:00-08:00', '2026-11-01T20:00:00-08:00'),
        timedEvent('t1', 'Dentist', '2026-11-01T09:00:00-08:00', '2026-11-01T10:00:00-08:00'),
        allDayEvent('a1', 'Holiday', '2026-11-01', '2026-11-02'),
        timedEvent('t0', null, '2026-11-01T11:00:00-08:00', '2026-11-01T11:30:00-08:00'),
        allDayEvent('a2', 'Yesterday only', '2026-10-31', '2026-11-01'),
        timedEvent('t3', 'Tomorrow', '2026-11-02T09:00:00-08:00', '2026-11-02T10:00:00-08:00'),
      ]),
    )
    renderCard()
    const items = await screen.findAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^All dayHoliday$/),
      expect.stringMatching(/^9:00\sAMDentist, ended$/),
      expect.stringMatching(/^11:00\sAM\(No title\), ended$/),
      expect.stringMatching(/^6:30\sPMDinner$/),
    ])
  })

  it('reads "Until" for an event from yesterday that ends today, and "All day" for one running through it', async () => {
    server.use(
      ...googleCalendarHandlers('connected', [
        timedEvent('t1', 'Flight', '2026-10-31T22:00:00-07:00', '2026-11-01T02:00:00-08:00'),
        timedEvent('t2', 'Conference', '2026-10-31T09:00:00-07:00', '2026-11-02T17:00:00-08:00'),
      ]),
    )
    renderCard()
    const [conference, flight] = await screen.findAllByRole('listitem')
    expect(flight.textContent).toMatch(/^Until 2:00\sAMFlight, ended$/)
    expect(conference.textContent).toBe('All dayConference')
  })

  it('shows a multi-day all-day event on a middle day, and not one whose exclusive end is today', async () => {
    server.use(
      ...googleCalendarHandlers('connected', [
        allDayEvent('a', 'Trip', '2026-10-30', '2026-11-04'),
        allDayEvent('b', 'Over', '2026-10-30', '2026-11-01'),
      ]),
    )
    renderCard()
    const list = await screen.findByRole('list')
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['All dayTrip'])
  })

  it('says there is nothing on the calendar when the API sends no events', async () => {
    server.use(...googleCalendarHandlers('connected', []))
    renderCard()
    expect(await screen.findByText('Nothing on your calendar today.')).toHaveClass('text-muted-foreground')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('says it too when the window holds events only for other days', async () => {
    server.use(
      ...googleCalendarHandlers('connected', [
        timedEvent('t1', 'Yesterday', '2026-10-31T09:00:00-07:00', '2026-10-31T10:00:00-07:00'),
        timedEvent('t2', 'Tomorrow', '2026-11-02T09:00:00-08:00', '2026-11-02T10:00:00-08:00'),
        allDayEvent('a', 'Ended', '2026-10-30', '2026-11-01'),
      ]),
    )
    renderCard()
    expect(await screen.findByText('Nothing on your calendar today.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('does not say it when the calendar is not connected', async () => {
    server.use(...googleCalendarHandlers('not_connected'))
    renderCard()
    await settled()
    expect(screen.queryByText('Nothing on your calendar today.')).not.toBeInTheDocument()
  })

  describe('with a running clock', () => {
    // Fake timers with MSW: only the timers the card uses and Date are faked, and vi.waitFor advances them.
    const useClock = (now: Date) => {
      vi.useRealTimers()
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now })
    }
    const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

    it('dims an event that has ended, with hidden ", ended" text, and leaves ongoing, later and all-day events alone', async () => {
      useClock(new Date(2026, 10, 1, 12, 0))
      server.use(
        ...googleCalendarHandlers('connected', [
          allDayEvent('a', 'Holiday', '2026-11-01', '2026-11-02'),
          timedEvent('t1', 'Breakfast', '2026-11-01T08:00:00-08:00', '2026-11-01T09:00:00-08:00'),
          timedEvent('t2', 'Lunch', '2026-11-01T11:30:00-08:00', '2026-11-01T12:30:00-08:00'),
          timedEvent('t3', 'Dinner', '2026-11-01T18:30:00-08:00', '2026-11-01T20:00:00-08:00'),
        ]),
      )
      renderCard()
      await vi.waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4))
      const [holiday, breakfast, lunch, dinner] = screen.getAllByRole('listitem')
      expect(breakfast).toHaveClass('text-muted-foreground')
      expect(breakfast).toHaveTextContent(/Breakfast, ended$/)
      expect(within(breakfast).getByText(', ended')).toHaveClass('sr-only')
      for (const li of [holiday, lunch, dinner]) {
        expect(li).not.toHaveClass('text-muted-foreground')
        expect(li).not.toHaveTextContent('ended')
      }
    })

    it('treats an event as ended at the moment it ends', async () => {
      useClock(new Date(2026, 10, 1, 12, 30))
      server.use(
        ...googleCalendarHandlers('connected', [
          timedEvent('t', 'Lunch', '2026-11-01T11:30:00-08:00', '2026-11-01T12:30:00-08:00'),
        ]),
      )
      renderCard()
      await vi.waitFor(() => expect(screen.getByRole('listitem')).toHaveTextContent(', ended'))
    })

    it('dims an event once the clock passes its end, with no new request', async () => {
      useClock(new Date(2026, 10, 1, 12, 0))
      let requests = 0
      server.use(
        http.get(`${API_BASE}/google_calendar_connection/events`, () => {
          requests += 1
          return HttpResponse.json(
            eventsBody('connected', [timedEvent('t', 'Lunch', '2026-11-01T12:01:00-08:00', '2026-11-01T12:03:00-08:00')]),
          )
        }),
      )
      renderCard()
      await vi.waitFor(() => expect(screen.getByRole('listitem')).toBeInTheDocument())
      expect(screen.getByRole('listitem')).not.toHaveClass('text-muted-foreground')

      await tick(4 * 60_000)
      expect(screen.getByRole('listitem')).toHaveClass('text-muted-foreground')
      expect(screen.getByRole('listitem')).toHaveTextContent(', ended')
      expect(requests).toBe(1)
    })

    it('changes the day at local midnight with no new request', async () => {
      useClock(new Date(2026, 10, 1, 23, 58))
      let requests = 0
      const events = [
        timedEvent('today', 'Late show', '2026-11-01T23:59:00-08:00', '2026-11-02T00:30:00-08:00'),
        timedEvent('next', 'Morning run', '2026-11-02T07:00:00-08:00', '2026-11-02T08:00:00-08:00'),
      ]
      server.use(
        http.get(`${API_BASE}/google_calendar_connection/events`, () => {
          requests += 1
          return HttpResponse.json(eventsBody('connected', events))
        }),
      )
      renderCard()
      await vi.waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
      expect(screen.getByRole('listitem')).toHaveTextContent(/^11:59\sPMLate show$/)

      // Past midnight the same answer is read as the next day: the show now began before today, and the run is added.
      await tick(3 * 60_000)
      expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
        expect.stringMatching(/^Until 12:30\sAMLate show$/),
        expect.stringMatching(/^7:00\sAMMorning run$/),
      ])
      expect(requests).toBe(1)
    })
  })

  describe('freshness', () => {
    const useClock = (now: Date) => {
      vi.useRealTimers()
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now })
    }
    const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

    it('shows when Google last answered, in muted text under the list', async () => {
      server.use(
        ...googleCalendarHandlers('connected', [timedEvent('t', 'Dentist', '2026-11-01T09:00:00-08:00', '2026-11-01T10:00:00-08:00')]),
      )
      renderCard()
      // 16:41:07 UTC is 8:41 AM in the test zone.
      const updated = await screen.findByText(/^Updated 8:41\sAM$/)
      expect(updated).toHaveClass('text-muted-foreground')
    })

    it('fetches exactly once more after five minutes and shows the new event and time', async () => {
      useClock(new Date(2026, 10, 1, 12, 0))
      let requests = 0
      server.use(
        http.get(`${API_BASE}/google_calendar_connection/events`, () => {
          requests += 1
          return requests === 1
            ? HttpResponse.json(eventsBody('connected', [allDayEvent('a', 'Holiday', '2026-11-01', '2026-11-02')], '2026-11-01T16:41:07Z'))
            : HttpResponse.json(
                eventsBody(
                  'connected',
                  [allDayEvent('a', 'Holiday', '2026-11-01', '2026-11-02'), timedEvent('t', 'Added', '2026-11-01T15:00:00-08:00', '2026-11-01T16:00:00-08:00')],
                  '2026-11-01T20:05:00Z',
                ),
              )
        }),
      )
      renderCard()
      await vi.waitFor(() => expect(screen.getByText(/^Updated 8:41\sAM$/)).toBeInTheDocument())
      expect(requests).toBe(1)

      await tick(TODAY_REFRESH_MS - 1000)
      expect(requests).toBe(1)
      await tick(1000)
      await vi.waitFor(() => expect(screen.getByText('Added')).toBeInTheDocument())
      expect(requests).toBe(2)
      expect(screen.getByText(/^Updated 12:05\sPM$/)).toBeInTheDocument()
      expect(screen.queryByText(/8:41/)).not.toBeInTheDocument()
    })

    it.each(['not_connected', 'lost'] as const)('never refreshes when %s', async (status) => {
      useClock(new Date(2026, 10, 1, 12, 0))
      let requests = 0
      server.use(
        http.get(`${API_BASE}/google_calendar_connection/events`, () => {
          requests += 1
          return HttpResponse.json(eventsBody(status))
        }),
      )
      renderCard()
      await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Connect Google Calendar' })).toBeInTheDocument())
      await tick(3 * TODAY_REFRESH_MS)
      expect(requests).toBe(1)
    })

    it('does not refresh while the page is in the background', async () => {
      useClock(new Date(2026, 10, 1, 12, 0))
      let requests = 0
      server.use(
        http.get(`${API_BASE}/google_calendar_connection/events`, () => {
          requests += 1
          return HttpResponse.json(eventsBody('connected'))
        }),
      )
      renderCard()
      await vi.waitFor(() => expect(screen.getByText('Nothing on your calendar today.')).toBeInTheDocument())
      act(() => focusManager.setFocused(false))
      await tick(3 * TODAY_REFRESH_MS)
      expect(requests).toBe(1)
    })
  })

  it('shows the Connect button, and neither the connected line nor an error, when not connected', async () => {
    server.use(...googleCalendarHandlers('not_connected'))
    renderCard()
    expect(await screen.findByRole('button', { name: 'Connect Google Calendar' })).toBeEnabled()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an alert, after one request only, when the events cannot be loaded', async () => {
    let requests = 0
    server.use(
      http.get(`${API_BASE}/google_calendar_connection/events`, () => {
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
      http.get(`${API_BASE}/google_calendar_connection/events`, () => {
        requests += 1
        return HttpResponse.json(eventsBody('connected'))
      }),
    )
    const client = renderCard()
    await settled()
    expect(requests).toBe(1)

    // Move only the clock (not timers) past the 60 s staleTime, and check that the query really is stale.
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 61_000 })
    expect(client.getQueryCache().find({ queryKey: ['google_calendar_today'] })?.isStaleByTime(60_000)).toBe(true)

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
    await settled()
    expect(screen.queryByRole('button', { name: 'Connect Google Calendar' })).not.toBeInTheDocument()
  })

  // Guards the test above against passing for the wrong reason: the same query with the default focus behavior does
  // refetch when the same focus signal is sent after the same time has passed.
  it('control: a stale query without the opt-out refetches on focus', async () => {
    let requests = 0
    server.use(
      http.get(`${API_BASE}/google_calendar_connection/events`, () => {
        requests += 1
        return HttpResponse.json(eventsBody('connected'))
      }),
    )
    function Plain() {
      const { data } = useQuery({
        queryKey: ['google_calendar_today'],
        queryFn: getTodayEvents,
        staleTime: 60_000,
      })
      return <p>{data?.google_calendar_connection.status ?? 'loading'}</p>
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

      await settled()
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
      expect(screen.queryByRole('list')).not.toBeInTheDocument()
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
