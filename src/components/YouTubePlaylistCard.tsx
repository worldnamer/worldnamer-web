import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLinkIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ApiError } from '@/api/client'
import {
  chooseYouTubePlaylist,
  getYouTubeConnection,
  getYouTubePlaylistItems,
  getYouTubePlaylists,
  removeYouTubePlaylistItem,
  startYouTubeAuthorization,
  type YouTubeItemsResponse,
  type YouTubeVideo,
} from '@/api/youtubeConnection'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { Button } from '@/components/ui/button'
import { navigateTo } from '@/lib/externalNavigation'
import { useConfirmDelete } from '@/lib/useConfirmDelete'
import { cn } from '@/lib/utils'
import { useYouTubeVideos } from '@/lib/useYouTubeVideos'
import { dotForPlaylistVideo, type DotColor } from '@/lib/youtubeDot'

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

const dotClasses: Record<DotColor, string> = {
  gray: 'bg-gray-400',
  yellow: 'bg-yellow-400',
  red: 'bg-red-400',
  green: 'bg-green-400',
}

// The YouTube card: the state of the YouTube link and, once it is connected, the chosen playlist.
// `selectedVideoId` is the video whose summary the page is showing, and `onSelect` asks the page to show another one or,
// with null, none. The page owns the selection so the transcripts card can read it.
export function YouTubePlaylistCard({
  selectedVideoId,
  onSelect,
}: {
  selectedVideoId: string | null
  onSelect: (videoId: string | null) => void
}) {
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

  // The videos are listed once a playlist is chosen and the link is still connected.
  const itemsQuery = useQuery({
    queryKey: ['youtube_playlist_items'],
    queryFn: getYouTubePlaylistItems,
    retry: false,
    enabled: data?.status === 'connected' && data.playlist !== null,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  // The recorded videos give each row its dot. They are only asked for once there is a list to put dots on.
  const recordedQuery = useYouTubeVideos({ enabled: !!itemsQuery.data?.videos })

  // A selection only stands while its row is still in the list and still final. A removed video, a lost connection or a
  // video that is being redone clears it, so the transcripts card never shows a video the list does not offer.
  const selectionStands =
    selectedVideoId !== null &&
    !!itemsQuery.data?.videos?.items.some(
      (item) => item.video_id === selectedVideoId && dotForPlaylistVideo(recordedQuery.data, item.video_id)?.clickable,
    )
  useEffect(() => {
    if (selectedVideoId !== null && !selectionStands) onSelect(null)
  }, [selectedVideoId, selectionStands, onSelect])

  const queryClient = useQueryClient()
  const playlistsStatus = playlistsQuery.data?.youtube_connection.status
  const itemsStatus = itemsQuery.data?.youtube_connection.status
  // The status query is the one place the status is read from, so a lost answer from the playlists or the videos asks
  // it to be read again rather than setting a second status here.
  useEffect(() => {
    if (playlistsStatus === 'lost' || itemsStatus === 'lost') {
      queryClient.invalidateQueries({ queryKey: ['youtube_connection'] })
    }
  }, [playlistsStatus, itemsStatus, queryClient])

  // The chosen playlist replaces the connection in the cache, so the card shows it without another request.
  const choose = useMutation({
    mutationFn: chooseYouTubePlaylist,
    onSuccess: (connection) => {
      queryClient.setQueryData(['youtube_connection'], connection)
      setChanging(false)
    },
  })

  // Each video has a Remove button that asks first; the one dialog below holds the video asked about. The video is only
  // taken out of this playlist, never deleted from YouTube. On success the row is dropped from the cached list and the
  // total lowered, without asking for the list again. After a confirmed removal the row's button is gone, so focus goes
  // to the card's heading; after Cancel it goes back to the button that opened the dialog.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const del = useConfirmDelete<YouTubeVideo>(() => headingRef.current)
  const [removeFailed, setRemoveFailed] = useState<string | null>(null)
  const remove = useMutation({
    mutationFn: (video: YouTubeVideo) => removeYouTubePlaylistItem(video.id),
    onMutate: () => setRemoveFailed(null),
    onSuccess: (_result, video) => {
      queryClient.setQueryData<YouTubeItemsResponse>(['youtube_playlist_items'], (old) =>
        old?.videos
          ? {
              ...old,
              videos: {
                total_count: Math.max(0, old.videos.total_count - 1),
                items: old.videos.items.filter((item) => item.id !== video.id),
              },
            }
          : old,
      )
    },
    onError: (error, video) => {
      setRemoveFailed(video.title)
      // The link is not connected any more, so the status is read again and the card shows Connect.
      if (error instanceof ApiError && error.status === 409) {
        queryClient.invalidateQueries({ queryKey: ['youtube_connection'] })
      }
    },
  })

  return (
    <section aria-labelledby="youtube-heading" className="w-full">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border pb-2">
        <h2 ref={headingRef} id="youtube-heading" tabIndex={-1} className="font-display text-xl tracking-wide">
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
        {itemsQuery.isError && (
          <p role="alert" className="text-destructive">
            Couldn't load the videos. Try reloading the page.
          </p>
        )}
        {itemsQuery.data?.videos && itemsQuery.data.videos.items.length === 0 && (
          <p className="text-muted-foreground">This playlist has no videos.</p>
        )}
        {itemsQuery.data?.videos && itemsQuery.data.videos.items.length > 0 && (
          <ul aria-label="Videos" className="grid gap-1">
            {itemsQuery.data.videos.items.map((video) => {
              const { id, video_id, title } = video
              const dot = dotForPlaylistVideo(recordedQuery.data, video_id)
              const selected = video_id !== null && video_id === selectedVideoId
              return (
              <li key={id} className={cn('flex items-center justify-between gap-3 rounded-md px-2 py-1', selected && 'bg-accent')}>
                {/* The dot has a text name so the state is not only a colour. The way to the video itself is the link
                    button beside Remove, which opens YouTube in a new tab. */}
                <span className="flex min-w-0 items-center gap-2">
                  {dot && (
                    <span
                      role="img"
                      aria-label={dot.label}
                      title={dot.label}
                      className={`size-2.5 shrink-0 rounded-full ${dotClasses[dot.color]}`}
                    />
                  )}
                  {dot?.clickable && video_id !== null ? (
                    <button
                      type="button"
                      aria-current={selected ? 'true' : undefined}
                      className="min-w-0 cursor-pointer break-words rounded-sm text-left hover:text-brand focus-visible:outline-2 focus-visible:outline-ring"
                      onClick={() => onSelect(video_id)}
                    >
                      {title}
                    </button>
                  ) : (
                    <span className="min-w-0 break-words">{title}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center">
                  {video_id !== null && (
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground" asChild>
                      <a
                        href={`https://www.youtube.com/watch?v=${encodeURIComponent(video_id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${title} on YouTube`}
                      >
                        <ExternalLinkIcon />
                      </a>
                    </Button>
                  )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${title}`}
                  onClick={(event) => del.ask(video, event.currentTarget)}
                >
                  <Trash2Icon />
                </Button>
                </span>
              </li>
              )
            })}
          </ul>
        )}
        {removeFailed !== null && (
          <p role="alert" className="text-destructive">
            Couldn't remove {removeFailed}. Try again.
          </p>
        )}
        {itemsQuery.data?.videos && itemsQuery.data.videos.total_count > itemsQuery.data.videos.items.length && (
          <p className="text-muted-foreground text-sm">
            Showing the first {itemsQuery.data.videos.items.length} of {itemsQuery.data.videos.total_count} videos.
          </p>
        )}
        {itemsQuery.data?.playlist?.available === false && (
          <div className="flex items-center justify-between gap-3">
            <p>This playlist is no longer available on YouTube.</p>
            <Button variant="outline" size="sm" onClick={() => setChanging(true)}>
              Choose another playlist
            </Button>
          </div>
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
      <ConfirmDeleteDialog
        open={del.open}
        onOpenChange={del.setOpen}
        title={`Remove "${del.target?.title ?? ''}" from this playlist?`}
        actionLabel="Remove"
        description="The video stays on YouTube."
        onConfirm={() => {
          if (del.target) remove.mutate(del.target)
        }}
        focusAfterClose={del.focusAfterClose}
      />
    </section>
  )
}
