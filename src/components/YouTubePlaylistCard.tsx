import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  chooseYouTubePlaylist,
  getYouTubeConnection,
  getYouTubePlaylists,
  startYouTubeAuthorization,
} from '@/api/youtubeConnection'
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
  // Set by Change playlist, so the list of playlists can be shown again for a playlist already chosen.
  const [changing, setChanging] = useState(false)

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

  // The playlists are only listed while the user has a link and has either no chosen playlist or is changing it.
  const playlistsQuery = useQuery({
    queryKey: ['youtube_playlists'],
    queryFn: getYouTubePlaylists,
    retry: false,
    enabled: data?.status === 'connected' && (data.playlist === null || changing),
  })

  const queryClient = useQueryClient()
  const playlistsStatus = playlistsQuery.data?.youtube_connection.status
  // The status query is the one place the status is read from, so a lost answer from the playlists asks it to be
  // read again rather than setting a second status here.
  useEffect(() => {
    if (playlistsStatus === 'lost') {
      queryClient.invalidateQueries({ queryKey: ['youtube_connection'] })
    }
  }, [playlistsStatus, queryClient])

  // The chosen playlist replaces the connection in the cache, so the card shows it without another request.
  const choose = useMutation({
    mutationFn: chooseYouTubePlaylist,
    onSuccess: (connection) => {
      queryClient.setQueryData(['youtube_connection'], connection)
      setChanging(false)
    },
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
        {data?.status === 'lost' && outcome === null && <p>The connection to YouTube was lost.</p>}
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
        {data?.playlist && (
          <div className="flex items-center justify-between gap-3">
            <p>Playlist: {data.playlist.title}</p>
            <Button variant="outline" size="sm" onClick={() => setChanging(true)}>
              Change playlist
            </Button>
          </div>
        )}
        {playlistsQuery.isError && (
          <p role="alert" className="text-destructive">
            Couldn't load your playlists. Try again.
          </p>
        )}
        {choose.isError && <p role="alert" className="text-destructive">Couldn't choose that playlist. Try again.</p>}
        {playlistsQuery.data?.playlists?.length === 0 && (
          <p className="text-muted-foreground">You have no playlists on YouTube.</p>
        )}
        {(changing || !data?.playlist) && playlistsQuery.data?.playlists && playlistsQuery.data.playlists.length > 0 && (
          <ul aria-label="Your playlists" className="grid gap-1">
            {playlistsQuery.data.playlists.map(({ id, title }) => (
              <li key={id} className="flex items-center justify-between gap-3">
                <span>{title}</span>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Choose ${title}`}
                  disabled={choose.isPending}
                  onClick={() => choose.mutate(id)}
                >
                  Choose
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
