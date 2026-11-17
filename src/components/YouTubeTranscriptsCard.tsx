import { useEffect, useRef } from 'react'
import type { YouTubeTranscriptVideo } from '@/api/youtubeVideos'
import { useYouTubeVideos } from '@/lib/useYouTubeVideos'
import { youtubeDot } from '@/lib/youtubeDot'

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

const summaryReasonSentences: Record<string, string> = {
  timed_out: 'The summary took too long.',
  rate_limited: 'The summary service was rate limited.',
  service_error: 'The summary service had an error.',
  empty_answer: 'The summary came back empty.',
  too_long: 'The transcript is too long to summarise.',
  unauthorized: 'The summary service refused the request.',
  model_unauthorized: 'The summary service refused the request.',
  busy: 'The summary service was busy.',
  unreachable: 'The summary service could not be reached.',
  bad_response: 'The summary service gave an answer we could not read.',
  unknown: 'Something went wrong.',
}

// What a final video has to say: its summary, or in plain words why there is none. Only text is returned, never markup,
// because the summary is untrusted model output and React renders it as a text node. Null when there is nothing to say.
function detailText(video: YouTubeTranscriptVideo): string | null {
  switch (video.state) {
    case 'no_captions':
      return 'No captions.'
    case 'failed':
      return sentenceFor(video.reason)
    case 'done':
      switch (video.summary?.state) {
        case 'done':
          return video.summary.text ?? null
        case 'nothing_to_summarise':
          return 'Nothing to summarise.'
        case 'failed':
          return `No summary: ${(video.summary.reason && summaryReasonSentences[video.summary.reason]) || fallbackReasonSentence}`
        default:
          return null
      }
    default:
      return null
  }
}

// The transcripts card: the summary of the video selected in the playlist card, or why it has none. Read only.
export function YouTubeTranscriptsCard({ videoId }: { videoId: string | null }) {
  const { data, isError, isPending } = useYouTubeVideos()
  const sectionRef = useRef<HTMLElement>(null)

  // Only a final video is shown; the playlist card does not let anything else be selected.
  const video = videoId === null ? undefined : data?.find((recorded) => recorded.youtube_id === videoId)
  const shown = video && youtubeDot(video).clickable ? video : undefined

  // On a narrow screen the card sits below the list, so a new selection brings it into view. jsdom has no
  // scrollIntoView, hence the guard.
  useEffect(() => {
    if (videoId !== null) sectionRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [videoId])

  return (
    <section ref={sectionRef} aria-labelledby="transcripts-heading" className="w-full">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border pb-2">
        <h2 id="transcripts-heading" className="break-words font-display text-xl tracking-wide">
          {shown ? shown.title : 'Transcripts'}
        </h2>
      </div>
      <div className="grid gap-2 border-b border-border py-2">
        {isPending && <p className="text-muted-foreground">Loading transcripts...</p>}
        {isError && !data && <p role="alert" className="text-destructive">Couldn't load the transcripts. Try reloading the page.</p>}
        {data && !shown && <p className="text-muted-foreground">Select a video to read its summary.</p>}
        {shown && (
          <article className="grid gap-2">
            {detailText(shown) !== null && (
              <p className="whitespace-pre-line break-words text-sm">{detailText(shown)}</p>
            )}
          </article>
        )}
      </div>
    </section>
  )
}
