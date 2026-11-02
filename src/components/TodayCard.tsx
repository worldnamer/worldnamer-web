import { useMutation, useQuery } from '@tanstack/react-query'
import { Fragment, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { getTodayEvents, startGoogleCalendarAuthorization, type TodayEvent } from '@/api/googleCalendarConnection'
import { Button } from '@/components/ui/button'
import { eventsOnDay, formatClock } from '@/lib/calendarDay'
import { navigateTo } from '@/lib/externalNavigation'
import { todayClass } from '@/lib/todayHighlight'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'

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

// How often the events are fetched again while the card is open and connected. The API keeps Google's answer for a
// minute, so a new event can take about this long plus a minute to appear.
export const TODAY_REFRESH_MS = 5 * 60_000

// How often the clock behind the list is renewed. Dimming and the change of day follow it, with no request.
const CLOCK_MS = 60_000

// Today's events, each with its start time or "All day". A missing title reads "(No title)". An event that has ended is
// dimmed, and also says ", ended" to a screen reader, because colour alone is not enough.
function TodayEventList({ items }: { items: TodayEvent[] }) {
  const now = useNow(CLOCK_MS)
  const rows = eventsOnDay(items, new Date(now))
  // Also the answer when the API sent events only for other days, or when every event of the day was filtered out.
  if (rows.length === 0) return <p className="text-muted-foreground">Nothing on your calendar today.</p>
  // The timed events start at the first row that has an end. A divider goes before the first timed row whose state
  // (ended or not) differs from the first timed row's, so it shows only when events lie on both sides of now.
  const firstTimed = rows.findIndex((row) => row.endsAtMs !== null)
  const isEnded = (endsAtMs: number | null) => endsAtMs !== null && now >= endsAtMs
  const ruleBefore =
    firstTimed < 0
      ? -1
      : rows.findIndex((row, i) => i > firstTimed && isEnded(row.endsAtMs) !== isEnded(rows[firstTimed].endsAtMs))
  return (
    // A long day scrolls inside the card. tabIndex lets a keyboard user focus the region to scroll it with the arrow keys,
    // and the name tells a screen reader what the region holds.
    <div role="region" aria-label="Today's events" tabIndex={0} className="max-h-96 overflow-y-auto">
      <ul className="grid gap-1">
        {rows.map(({ event, label, endsAtMs }, index) => {
          const ended = isEnded(endsAtMs)
          return (
            <Fragment key={event.id}>
              {/* A purely visual divider, hidden from assistive technology so the list keeps only its events. */}
              {index === ruleBefore && <li aria-hidden="true" className="mx-auto my-1 h-px w-1/2 bg-border" />}
              <li
                className={cn(
                  'flex gap-3',
                  endsAtMs === null && todayClass,
                  // A little space between the all-day group and the first timed event, only when both are shown.
                  index === firstTimed && index > 0 && 'mt-2',
                  ended && 'text-muted-foreground',
                )}
              >
                <span className="w-20 shrink-0 tabular-nums">{label}</span>
                <span className="min-w-0 break-words">
                  {event.title ?? '(No title)'}
                  {ended && <span className="sr-only">, ended</span>}
                </span>
              </li>
            </Fragment>
          )
        })}
      </ul>
    </div>
  )
}

// The Today card: the state of the Google Calendar link and, when connected, today's events.
export function TodayCard() {
  const { data, isPending, isError, isRefetchError } = useQuery({
    queryKey: ['google_calendar_today'],
    queryFn: getTodayEvents,
    retry: false, // a down API should show the error at once, not after several retries
    // The API asks Google for the events, which also shows whether the stored token still works, so this is loaded
    // when the page loads and then at most once a minute while the page stays open.
    staleTime: 60_000,
    // The app's default client refetches a stale query whenever the window regains focus. That would call Google
    // every time the user tabs back, so it is switched off here on purpose.
    refetchOnWindowFocus: false,
    // Fetch again every few minutes, but only while connected: a card that is not connected or lost has nothing to
    // refresh, and polling it would only call Google for nothing. Not in a background tab either, which is the
    // default; it is written out so the choice is visible.
    refetchInterval: (query) =>
      query.state.data?.google_calendar_connection.status === 'connected' ? TODAY_REFRESH_MS : false,
    refetchIntervalInBackground: false,
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
    <section aria-labelledby="today-heading" className="w-full">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border pb-2">
        <h2 id="today-heading" className="font-display text-xl tracking-wide">
          Today
        </h2>
      </div>
      <div className="grid gap-2 border-b border-border py-2">
        {isPending && <p className="text-muted-foreground">Loading calendar...</p>}
        {/* Only a first load that failed: a failed refresh keeps the last data and is marked on the Updated line instead. */}
        {isError && !data && (
          <p role="alert" className="text-destructive">
            Couldn't load your calendar connection. Try reloading the page.
          </p>
        )}
        {status === 'connected' && data?.events && (
          <>
            <TodayEventList items={data.events.items} />
            {/* The time Google answered, as the API saw it, so a wrong device clock cannot make it wrong. */}
            {/* After a failed refresh the last answer stays on screen, marked, until the next success. */}
            <p className={cn('text-right text-xs', isRefetchError ? 'text-destructive' : 'text-muted-foreground')}>
              {isRefetchError && 'Out of date. '}Updated {formatClock(new Date(data.events.fetched_at))}
              {isRefetchError && '.'}
            </p>
          </>
        )}
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
