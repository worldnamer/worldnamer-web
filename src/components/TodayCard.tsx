import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { getTodayEvents, startGoogleCalendarAuthorization, type TodayEvent } from '@/api/googleCalendarConnection'
import { Button } from '@/components/ui/button'
import { eventsOnDay } from '@/lib/calendarDay'
import { navigateTo } from '@/lib/externalNavigation'

// The API sends the browser back to the site with ?google_calendar=connected, cancelled or failed after Google's
// consent screen. Only the two that need a message are kept; "connected" needs none, because the events query says
// so, and anything else is ignored. The parameter is only a hint: nothing is believed from the URL but this message.
const OUTCOME_PARAM = 'google_calendar'
const outcomeMessages = {
  cancelled: "Google Calendar wasn't connected.",
  failed: "Couldn't connect Google Calendar. Try again.",
}
type Outcome = keyof typeof outcomeMessages

function outcomeFrom(search: string): Outcome | null {
  const value = new URLSearchParams(search).get(OUTCOME_PARAM)
  return value === 'cancelled' || value === 'failed' ? value : null
}

// Today's events, each with its start time or "All day". A missing title reads "(No title)".
function TodayEventList({ items }: { items: TodayEvent[] }) {
  // Read once when the list appears; a later change adds a clock that keeps it current.
  const [now] = useState(() => new Date())
  const rows = eventsOnDay(items, now)
  // Also the answer when the API sent events only for other days, or when every event of the day was filtered out.
  if (rows.length === 0) return <p className="text-muted-foreground">Nothing on your calendar today.</p>
  return (
    <ul className="grid gap-1">
      {rows.map(({ event, label }) => (
        <li key={event.id} className="flex gap-3">
          <span className="w-20 shrink-0 tabular-nums">{label}</span>
          <span className="min-w-0 break-words">{event.title ?? '(No title)'}</span>
        </li>
      ))}
    </ul>
  )
}

// The Today card: the state of the Google Calendar link and, when connected, today's events.
export function TodayCard() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['google_calendar_today'],
    queryFn: getTodayEvents,
    retry: false, // a down API should show the error at once, not after several retries
    // The API asks Google for the events, which also shows whether the stored token still works, so this is loaded
    // when the page loads and then at most once a minute while the page stays open.
    staleTime: 60_000,
    // The app's default client refetches a stale query whenever the window regains focus. That would call Google
    // every time the user tabs back, so it is switched off here on purpose.
    refetchOnWindowFocus: false,
  })

  const status = data?.google_calendar_connection.status

  const { search } = useLocation()
  const navigate = useNavigate()
  // Read once, on the first render, so the message survives the URL cleanup below. It is cleared when Connect is clicked.
  const [outcome, setOutcome] = useState(() => outcomeFrom(search))

  // Takes the parameter out of the address on mount, replacing the history entry so Back does not return to it, and
  // so a reload does not show the message again. This is URL cleanup, not a fetch. Other parameters stay.
  useEffect(() => {
    const params = new URLSearchParams(search)
    if (!params.has(OUTCOME_PARAM)) return
    params.delete(OUTCOME_PARAM)
    navigate({ search: params.toString() }, { replace: true })
    // Mount only: the message was read from this first address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Asks the API for Google's consent address and leaves the site for it. The button stays disabled after success: the
  // page is on its way to Google, and a second click would start a second flow that replaces the first.
  const start = useMutation({
    mutationFn: startGoogleCalendarAuthorization,
    onSuccess: (url) => navigateTo(url),
  })

  return (
    <section aria-labelledby="today-heading" className="w-full lg:w-1/4 lg:order-last">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border pb-2">
        <h2 id="today-heading" className="font-display text-xl tracking-wide">
          Today
        </h2>
      </div>
      <div className="grid gap-2 border-b border-border py-2">
        {isPending && <p className="text-muted-foreground">Loading calendar...</p>}
        {isError && (
          <p role="alert" className="text-destructive">
            Couldn't load your calendar connection. Try reloading the page.
          </p>
        )}
        {status === 'connected' && data?.events && <TodayEventList items={data.events.items} />}
        {/* A message about the connect attempt just made is more recent than the stored state, so it replaces this line. */}
        {status === 'lost' && outcome === null && <p>The connection to Google Calendar was lost.</p>}
        {(status === 'not_connected' || status === 'lost') && (
          <Button className="justify-self-start" disabled={start.isPending || start.isSuccess} onClick={() => {
              setOutcome(null)
              start.mutate()
            }}
          >
            Connect Google Calendar
          </Button>
        )}
        {outcome !== null && (
          <p role="alert" className="text-destructive">
            {outcomeMessages[outcome]}
          </p>
        )}
        {start.isError && (
          <p role="alert" className="text-destructive">
            Couldn't start connecting. Try again.
          </p>
        )}
      </div>
    </section>
  )
}
