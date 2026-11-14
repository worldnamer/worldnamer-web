import { apiErrorFrom, apiFetch } from './client'

// What the API says about the user's YouTube link. `lost` means YouTube no longer accepts the stored token.
export type YouTubeStatus = 'not_connected' | 'connected' | 'lost'

// The playlist the user chose to show, as the API names it.
export type YouTubePlaylist = { id: string; title: string }

export type YouTubeConnection = { status: YouTubeStatus; playlist: YouTubePlaylist | null }

// GET /youtube_connection. Rejects with ApiError on a non-2xx answer.
export async function getYouTubeConnection(): Promise<YouTubeConnection> {
  const response = await apiFetch('/youtube_connection')
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { youtube_connection: YouTubeConnection }
  return body.youtube_connection
}
