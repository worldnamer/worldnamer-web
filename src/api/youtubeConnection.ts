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

// What GET /youtube_connection/playlists answers. `playlists` is null when there is nothing to list.
export type YouTubePlaylistsResponse = {
  youtube_connection: { status: YouTubeStatus }
  playlists: YouTubePlaylist[] | null
}

// GET /youtube_connection/playlists. Rejects with ApiError on a non-2xx answer.
export async function getYouTubePlaylists(): Promise<YouTubePlaylistsResponse> {
  const response = await apiFetch('/youtube_connection/playlists')
  if (!response.ok) throw await apiErrorFrom(response)
  return (await response.json()) as YouTubePlaylistsResponse
}

// PUT /youtube_connection/playlist saves the playlist the user chose to show. Resolves the connection as the API now
// has it. Rejects with ApiError on a non-2xx answer.
export async function chooseYouTubePlaylist(id: string): Promise<YouTubeConnection> {
  const response = await apiFetch('/youtube_connection/playlist', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlist: { id } }),
  })
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { youtube_connection: YouTubeConnection }
  return body.youtube_connection
}

// POST /youtube_connection/authorization. The API answers with the Google consent address and sets the
// wn_youtube_oauth cookie, which is why the request must send credentials; the cookie is what lets the callback
// check that the consent started in this browser. Rejects with ApiError on a non-2xx answer.
export async function startYouTubeAuthorization(): Promise<string> {
  const response = await apiFetch('/youtube_connection/authorization', { method: 'POST', credentials: 'include' })
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { authorization_url: string }
  return body.authorization_url
}

// One entry of the chosen playlist. `video_id` is null when the video cannot be linked to.
export type YouTubeVideo = { id: string; video_id: string | null; title: string; position: number }

// What GET /youtube_connection/playlist/items answers. `playlist` and `videos` are null when no playlist is chosen.
export type YouTubeItemsResponse = {
  youtube_connection: { status: YouTubeStatus }
  playlist: { id: string; title: string; available: boolean } | null
  videos: { total_count: number; items: YouTubeVideo[] } | null
}

// GET /youtube_connection/playlist/items. Rejects with ApiError on a non-2xx answer.
export async function getYouTubePlaylistItems(): Promise<YouTubeItemsResponse> {
  const response = await apiFetch('/youtube_connection/playlist/items')
  if (!response.ok) throw await apiErrorFrom(response)
  return (await response.json()) as YouTubeItemsResponse
}

// DELETE /youtube_connection/playlist/items/:id takes one video out of the chosen playlist and answers 204 with no body.
// `id` is the playlist item's id from the videos list, not the video's own id. The video itself stays on YouTube.
// Rejects with ApiError otherwise; a 409 means the YouTube link is not connected (or was lost).
export async function removeYouTubePlaylistItem(id: string): Promise<void> {
  const response = await apiFetch(`/youtube_connection/playlist/items/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!response.ok) throw await apiErrorFrom(response)
}
