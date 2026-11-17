import { describe, expect, it } from 'vitest'
import type { YouTubeSummary, YouTubeTranscriptVideo } from '@/api/youtubeVideos'
import { dotForPlaylistVideo, youtubeDot } from './youtubeDot'

function recorded(overrides: Partial<YouTubeTranscriptVideo>): YouTubeTranscriptVideo {
  return { youtube_id: 'abcdefghijk', title: 'A video', state: 'done', reason: null, ...overrides }
}

function withSummary(summary: YouTubeSummary | null | undefined) {
  return youtubeDot(recorded({ state: 'done', summary }))
}

describe('youtubeDot', () => {
  it('is gray for a playlist video nobody has recorded', () => {
    expect(youtubeDot(undefined)).toMatchObject({ color: 'gray', label: 'No transcript yet' })
  })

  it('is gray while the transcript is waiting', () => {
    expect(youtubeDot(recorded({ state: 'waiting' }))).toMatchObject({ color: 'gray', label: 'Transcript waiting' })
  })

  it('is gray while the transcript is being fetched', () => {
    expect(youtubeDot(recorded({ state: 'working' }))).toMatchObject({ color: 'gray', label: 'Fetching transcript' })
  })

  it('is red when the transcript has no captions', () => {
    expect(youtubeDot(recorded({ state: 'no_captions' }))).toMatchObject({ color: 'red', label: 'No captions' })
  })

  it('is red when the transcript failed', () => {
    expect(youtubeDot(recorded({ state: 'failed', reason: 'blocked' }))).toMatchObject({
      color: 'red',
      label: 'Transcript failed',
    })
  })

  it('is yellow when the transcript is done and the summary is missing', () => {
    expect(withSummary(undefined)).toMatchObject({ color: 'yellow', label: 'Summary waiting' })
    expect(withSummary(null)).toMatchObject({ color: 'yellow', label: 'Summary waiting' })
  })

  it('is yellow while the summary is waiting or being made', () => {
    expect(withSummary({ state: 'waiting' })).toMatchObject({ color: 'yellow', label: 'Summary waiting' })
    expect(withSummary({ state: 'working' })).toMatchObject({ color: 'yellow', label: 'Summarising' })
  })

  it('is red when the summary failed', () => {
    expect(withSummary({ state: 'failed', reason: 'timed_out' })).toMatchObject({
      color: 'red',
      label: 'Summary failed',
    })
  })

  it('is green when the summary is done', () => {
    expect(withSummary({ state: 'done', text: 'Text.' })).toMatchObject({ color: 'green', label: 'Summary available' })
  })

  it('is green when there was nothing to summarise', () => {
    expect(withSummary({ state: 'nothing_to_summarise' })).toMatchObject({
      color: 'green',
      label: 'Nothing to summarise',
    })
  })

  it('has no dot while the recorded videos are unknown', () => {
    expect(dotForPlaylistVideo(undefined, 'abcdefghijk')).toBeNull()
  })

  it('looks a playlist video up by its id among the recorded ones', () => {
    const videos = [recorded({ youtube_id: 'aaaaaaaaaaa', state: 'no_captions' })]
    expect(dotForPlaylistVideo(videos, 'aaaaaaaaaaa')?.color).toBe('red')
    expect(dotForPlaylistVideo(videos, 'bbbbbbbbbbb')?.color).toBe('gray')
    expect(dotForPlaylistVideo(videos, null)?.color).toBe('gray')
  })

  it('marks only red and green as clickable', () => {
    const dots = [
      youtubeDot(undefined),
      youtubeDot(recorded({ state: 'waiting' })),
      youtubeDot(recorded({ state: 'working' })),
      youtubeDot(recorded({ state: 'no_captions' })),
      youtubeDot(recorded({ state: 'failed' })),
      withSummary(undefined),
      withSummary({ state: 'waiting' }),
      withSummary({ state: 'working' }),
      withSummary({ state: 'failed' }),
      withSummary({ state: 'done', text: 'x' }),
      withSummary({ state: 'nothing_to_summarise' }),
    ]
    for (const dot of dots) expect(dot.clickable).toBe(dot.color === 'red' || dot.color === 'green')
  })
})
