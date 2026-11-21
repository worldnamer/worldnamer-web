import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, errorBody, REFRESH_TOKEN, youtubeVideosHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { ApiError } from './client'
import { getYouTubeVideos, requeueYouTubeVideo } from './youtubeVideos'

describe('getYouTubeVideos', () => {
  beforeEach(() => {
    queryClient.clear()
    clearAccessToken()
  })

  it('resolves each video as the API gives it', async () => {
    setAccessToken(REFRESH_TOKEN)
    server.use(
      ...youtubeVideosHandlers([
        { youtube_id: 'abcdefghijk', title: 'First', state: 'done', reason: null },
        { youtube_id: 'lmnopqrstuv', title: 'Second', state: 'failed', reason: 'blocked' },
      ]),
    )

    expect(await getYouTubeVideos()).toEqual([
      { youtube_id: 'abcdefghijk', title: 'First', state: 'done', reason: null },
      { youtube_id: 'lmnopqrstuv', title: 'Second', state: 'failed', reason: 'blocked' },
    ])
  })

  it('rejects with an ApiError when the API refuses', async () => {
    server.use(...youtubeVideosHandlers([]))

    await expect(getYouTubeVideos()).rejects.toMatchObject({ status: 401 })
    await expect(getYouTubeVideos()).rejects.toBeInstanceOf(ApiError)
  })
})

describe('requeueYouTubeVideo', () => {
  beforeEach(() => {
    clearAccessToken()
  })

  it("requeueYouTubeVideo POSTs to the video's requeue path and resolves on 202", async () => {
    setAccessToken(REFRESH_TOKEN)
    const seen = { method: '', pathname: '' }
    server.use(
      http.post(`${API_BASE}/youtube_connection/videos/:youtubeId/requeue`, ({ request }) => {
        seen.method = request.method
        seen.pathname = new URL(request.url).pathname
        return new HttpResponse(null, { status: 202 })
      }),
    )

    await expect(requeueYouTubeVideo('dQw4w9WgXcQ')).resolves.toBeUndefined()
    expect(seen.method).toBe('POST')
    expect(seen.pathname.endsWith('/youtube_connection/videos/dQw4w9WgXcQ/requeue')).toBe(true)
  })

  it('requeueYouTubeVideo resolves on 200 and rejects with ApiError on 404', async () => {
    setAccessToken(REFRESH_TOKEN)
    server.use(
      http.post(`${API_BASE}/youtube_connection/videos/:youtubeId/requeue`, ({ params }) => {
        if (params.youtubeId === 'missingVideo') {
          return HttpResponse.json(errorBody('not_found', 'Not found.'), { status: 404 })
        }
        return new HttpResponse(null, { status: 200 })
      }),
    )

    await expect(requeueYouTubeVideo('dQw4w9WgXcQ')).resolves.toBeUndefined()
    const refused = requeueYouTubeVideo('missingVideo')
    await expect(refused).rejects.toBeInstanceOf(ApiError)
    await expect(refused).rejects.toMatchObject({ status: 404 })
  })
})
