import { type YouTubeSummary, type YouTubeVideoState } from '@/api/youtubeVideos'
import { useYouTubeVideos } from '@/lib/useYouTubeVideos'

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

// What to show under a title for a summary. The text is untrusted model output, so it is only ever returned as a string
// for React to render as a text node.
function summaryLine(summary: YouTubeSummary): string | null {
  switch (summary.state) {
    case 'waiting':
      return 'Summary waiting'
    case 'working':
      return 'Summarising'
    case 'done':
      return summary.text ?? null
    case 'nothing_to_summarise':
      return 'Nothing to summarise.'
    case 'failed':
      return `No summary: ${(summary.reason && summaryReasonSentences[summary.reason]) || fallbackReasonSentence}`
    default:
      return null
  }
}

// The transcripts card: each recorded video of the chosen playlist with the state of its transcript. Read only.
export function YouTubeTranscriptsCard() {
  const { data, isError, isPending } = useYouTubeVideos()

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
                {video.summary && summaryLine(video.summary) !== null && (
                  <p className="basis-full whitespace-pre-line break-words text-sm">{summaryLine(video.summary)}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
