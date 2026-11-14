import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { getYouTubeConnection, startYouTubeAuthorization } from '@/api/youtubeConnection'
import { Button } from '@/components/ui/button'
import { navigateTo } from '@/lib/externalNavigation'

// The API sends the browser back to the site with ?youtube=connected, cancelled or failed after Google's consent
// screen. Only the two that need a message are kept; "connected" needs none, because the status query says so, and
// anything else is ignored. The parameter is only a hint: nothing is believed from the URL but this message.
const OUTCOME_PARAM = 'youtube'
const outcomeMessages = {
  cancelled: "YouTube wasn't connected.",
  failed: "Couldn't connect YouTube. Try again.",
}
type Outcome = keyof typeof outcomeMessages

function outcomeFrom(search: string): Outcome | null {
  const value = new URLSearchParams(search).get(OUTCOME_PARAM)
  return value === 'cancelled' || value === 'failed' ? value : null
}

// The YouTube card: the state of the YouTube link and, once it is connected, the chosen playlist.
export function YouTubePlaylistCard() {
  const start = useMutation({
    mutationFn: startYouTubeAuthorization,
    onSuccess: (url) => navigateTo(url),
  })

  const { search } = useLocation()
  const navigate = useNavigate()
  // Read on the first render only, so the message does not change while the card stays open.
  const [outcome, setOutcome] = useState(() => outcomeFrom(search))

  // Removes the outcome parameter from the address on mount, replacing the history entry so Back does not return to
  // the message. Other parameters are kept as they are.
  useEffect(() => {
    const params = new URLSearchParams(search)
    if (!params.has(OUTCOME_PARAM)) return
    params.delete(OUTCOME_PARAM)
    navigate({ search: params.toString() }, { replace: true })
    // Mount only: the message was read from this first address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data, isPending, isError } = useQuery({
    queryKey: ['youtube_connection'],
    queryFn: getYouTubeConnection,
    retry: false, // a down API should show the error at once, not after several retries
    // The API asks Google whether the stored token works, so the status is not refetched whenever the user tabs back.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  return (
    <section aria-labelledby="youtube-heading" className="w-full">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border pb-2">
        <h2 id="youtube-heading" className="font-display text-xl tracking-wide">
          YouTube
        </h2>
      </div>
      <div className="grid gap-2 border-b border-border py-2">
        {isPending && <p className="text-muted-foreground">Loading YouTube...</p>}
        {isError && !data && (
          <p role="alert" className="text-destructive">
            Couldn't load your YouTube connection. Try reloading the page.
          </p>
        )}
        {(data?.status === 'not_connected' || data?.status === 'lost') && (
          /* After success the page is leaving for Google, so the button stays disabled;
             a second click would start a second authorization flow. */
          <Button
            className="justify-self-start"
            disabled={start.isPending || start.isSuccess}
            onClick={() => {
              // A new attempt replaces the message from the last one.
              setOutcome(null)
              start.mutate()
            }}
          >
            Connect YouTube
          </Button>
        )}
        {outcome !== null && (
          <p role="alert" className="text-destructive">
            {outcomeMessages[outcome]}
          </p>
        )}
        {start.isError && <p role="alert" className="text-destructive">Couldn't start connecting. Try again.</p>}
        {data?.status === 'connected' && <p>YouTube connected.</p>}
      </div>
    </section>
  )
}
