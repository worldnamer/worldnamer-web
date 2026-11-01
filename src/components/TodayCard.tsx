import { useQuery } from '@tanstack/react-query'
import { getGoogleCalendarConnection } from '@/api/googleCalendarConnection'

// The Today card: today's calendar will go here; for now it holds the state of the Google Calendar link.
export function TodayCard() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['google_calendar_connection'],
    queryFn: getGoogleCalendarConnection,
    retry: false, // a down API should show the error at once, not after several retries
    // The API asks Google whether the stored token still works, so the status is checked when the page loads and
    // then at most once a minute while the page stays open.
    staleTime: 60_000,
    // The app's default client refetches a stale query whenever the window regains focus. That would call Google
    // every time the user tabs back, so it is switched off here on purpose.
    refetchOnWindowFocus: false,
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
        {data === 'connected' && <p>Google Calendar connected.</p>}
      </div>
    </section>
  )
}
