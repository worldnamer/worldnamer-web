import { apiErrorFrom, apiFetch } from './client'

// The state of one video's transcript, as the API reports it.
export type YouTubeVideoState = 'waiting' | 'working' | 'done' | 'no_captions' | 'failed'

// The state of one video's summary, as the API reports it.
export type YouTubeSummaryState = 'waiting' | 'working' | 'done' | 'nothing_to_summarise' | 'failed'

// `text` is present only when the state is done and `reason` only when it is failed. The text is untrusted model output.
export type YouTubeSummary = {
  state: YouTubeSummaryState
  text?: string
  reason?: string
}

// One recorded video of the chosen playlist. `reason` is null unless the state is failed.
// `summary` is null unless the transcript is done, and absent from an older API.
export type YouTubeTranscriptVideo = {
  youtube_id: string
  title: string
  state: YouTubeVideoState
  reason: string | null
  summary?: YouTubeSummary | null
}

// GET /youtube_connection/videos. Answers the recorded videos, newest first, or an empty list when there are none.
// Rejects with ApiError on a non-2xx answer; a 401 means the user is not logged in.
export async function getYouTubeVideos(): Promise<YouTubeTranscriptVideo[]> {
  const response = await apiFetch('/youtube_connection/videos')
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { videos: YouTubeTranscriptVideo[] }
  return body.videos
}
