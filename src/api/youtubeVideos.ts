import { apiErrorFrom, apiFetch } from './client'

// The state of one video's transcript, as the API reports it.
export type YouTubeVideoState = 'waiting' | 'working' | 'done' | 'no_captions' | 'failed'

// One recorded video of the chosen playlist. `reason` is null unless the state is failed.
export type YouTubeTranscriptVideo = {
  youtube_id: string
  title: string
  state: YouTubeVideoState
  reason: string | null
}

// GET /youtube_connection/videos. Answers the recorded videos, newest first, or an empty list when there are none.
// Rejects with ApiError on a non-2xx answer; a 401 means the user is not logged in.
export async function getYouTubeVideos(): Promise<YouTubeTranscriptVideo[]> {
  const response = await apiFetch('/youtube_connection/videos')
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { videos: YouTubeTranscriptVideo[] }
  return body.videos
}
