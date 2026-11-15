import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { REFRESH_TOKEN, youtubeVideosHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { ApiError } from './client'
import { getYouTubeVideos } from './youtubeVideos'

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
