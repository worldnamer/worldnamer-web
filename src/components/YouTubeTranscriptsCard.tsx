import { useQuery } from '@tanstack/react-query'
import { getYouTubeVideos, type YouTubeVideoState } from '@/api/youtubeVideos'

const stateLabels: Record<YouTubeVideoState, string> = {
  waiting: 'Waiting',
  working: 'Working',
  done: 'Done',
  no_captions: 'No captions',
  failed: 'Failed',
}

const reasonSentences: Record<string, string> = {
  blocked: 'YouTube blocked the request.',
  timed_out: 'The request timed out.',
  unavailable: 'The video is unavailable.',
  proxy_refused: 'The proxy refused the request.',
  youtube_error: 'YouTube returned an error.',
  busy: 'The transcript service was busy.',
  unauthorized: 'The transcript service refused the request.',
  unreachable: 'The transcript service could not be reached.',
  bad_response: 'The transcript service sent an unexpected answer.',
  unknown: 'Something went wrong.',
}

const fallbackReasonSentence = 'Something went wrong.'

function sentenceFor(reason: string | null): string {
  return (reason && reasonSentences[reason]) || fallbackReasonSentence
}

// The transcripts card: each recorded video of the chosen playlist with the state of its transcript. Read only.
export function YouTubeTranscriptsCard() {
  const { data, isError, isPending } = useQuery({
    queryKey: ['youtube_videos'],
    queryFn: getYouTubeVideos,
    retry: false, // a down API should show the error at once, not after several retries
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  return (
    <section aria-labelledby="transcripts-heading" className="w-full">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border pb-2">
        <h2 id="transcripts-heading" className="font-display text-xl tracking-wide">
          Transcripts
        </h2>
      </div>
      <div className="grid gap-2 border-b border-border py-2">
        {isPending && <p className="text-muted-foreground">Loading transcripts...</p>}
        {isError && !data && <p role="alert" className="text-destructive">Couldn't load the transcripts. Try reloading the page.</p>}
        {data && data.length === 0 && <p className="text-muted-foreground">No videos recorded yet.</p>}
        {data && data.length > 0 && (
          <ul aria-label="Videos" className="grid gap-1">
            {data.map((video) => (
              <li key={video.youtube_id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-0 break-words">{video.title}</span>
                <span className="shrink-0 text-sm text-muted-foreground">{stateLabels[video.state]}</span>
                {video.state === 'failed' && (
                  <span className="basis-full text-sm text-muted-foreground">{sentenceFor(video.reason)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
