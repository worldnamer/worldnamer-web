import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import type { YouTubeItemsResponse } from '@/api/youtubeConnection'
import {
  API_BASE,
  errorBody,
  type MockYouTubeVideo,
  REFRESH_TOKEN,
  youtubeHandlers,
} from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { YouTubePlaylistCard } from './YouTubePlaylistCard'

beforeEach(() => {
  clearAccessToken()
  setAccessToken(REFRESH_TOKEN)
})

afterEach(() => {
  vi.restoreAllMocks()
  focusManager.setFocused(undefined)
})

// A new client with TanStack Query's own defaults, as the other YouTube card tests use.
function renderCard() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <YouTubePlaylistCard selectedVideoId={null} onSelect={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Answers a connected link with a chosen playlist, the recorded videos, and one playlist item per recorded video.
function useRows(recorded: MockYouTubeVideo[]) {
  const body: YouTubeItemsResponse = {
    youtube_connection: { status: 'connected' },
    playlist: { id: 'PLb', title: 'Music', available: true },
    videos: {
      total_count: recorded.length,
      items: recorded.map((video, index) => ({
        id: `i${index}`,
        video_id: video.youtube_id,
        title: video.title,
        position: index,
      })),
    },
  }
  server.use(
    ...youtubeHandlers('connected', { id: 'PLb', title: 'Music' }, recorded),
    http.get(`${API_BASE}/youtube_connection/playlist/items`, () => HttpResponse.json(body)),
  )
}

describe('the requeue button on the playlist rows', () => {
  it('shows a Requeue button on every finished row and none on waiting or working rows', async () => {
    useRows([
      { youtube_id: 'aaaaaaaaaaa', title: 'Failed', state: 'failed', reason: 'x' },
      { youtube_id: 'bbbbbbbbbbb', title: 'No captions', state: 'no_captions', reason: null },
      {
        youtube_id: 'ccccccccccc',
        title: 'Summarised',
        state: 'done',
        reason: null,
        summary: { state: 'done', text: 'S' },
      },
      {
        youtube_id: 'ddddddddddd',
        title: 'Nothing',
        state: 'done',
        reason: null,
        summary: { state: 'nothing_to_summarise' },
      },
      {
        youtube_id: 'eeeeeeeeeee',
        title: 'Summary failed',
        state: 'done',
        reason: null,
        summary: { state: 'failed', reason: 'busy' },
      },
      { youtube_id: 'fffffffffff', title: 'Waiting', state: 'waiting', reason: null },
      { youtube_id: 'ggggggggggg', title: 'Working', state: 'working', reason: null },
      {
        youtube_id: 'hhhhhhhhhhh',
        title: 'Summary waiting',
        state: 'done',
        reason: null,
        summary: { state: 'waiting' },
      },
      {
        youtube_id: 'iiiiiiiiiii',
        title: 'Summarising',
        state: 'done',
        reason: null,
        summary: { state: 'working' },
      },
    ])
    renderCard()

    const list = await screen.findByRole('list', { name: 'Videos' })
    await vi.waitFor(() => expect(within(list).getAllByRole('button', { name: /^Requeue / })).toHaveLength(5))
    for (const title of ['Failed', 'No captions', 'Summarised', 'Nothing', 'Summary failed']) {
      expect(within(list).getByRole('button', { name: `Requeue ${title}` })).toBeInTheDocument()
    }
    for (const title of ['Waiting', 'Working', 'Summary waiting', 'Summarising']) {
      expect(within(list).queryByRole('button', { name: `Requeue ${title}` })).toBeNull()
    }
  })
})

describe('requeueing a finished row', () => {
  it('requeues a row at once, without asking, and shows it waiting once the list is read again', async () => {
    const rows: MockYouTubeVideo[] = [
      { youtube_id: 'vidfailed01', title: 'First', state: 'failed', reason: 'x' },
    ]
    const posts: string[] = []
    useRows(rows)
    server.use(
      http.get(`${API_BASE}/youtube_connection/videos`, () => HttpResponse.json({ videos: rows })),
      http.post(`${API_BASE}/youtube_connection/videos/:youtubeId/requeue`, ({ request, params }) => {
        posts.push(new URL(request.url).pathname)
        const index = rows.findIndex((row) => row.youtube_id === params.youtubeId)
        if (index !== -1) {
          rows[index] = { ...rows[index], state: 'waiting', reason: null, summary: null }
        }
        return new HttpResponse(null, { status: 202 })
      }),
    )
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: 'Requeue First' }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    await vi.waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0].endsWith('/youtube_connection/videos/vidfailed01/requeue')).toBe(true)
    await screen.findByRole('img', { name: 'Transcript waiting' })
    expect(screen.queryByRole('button', { name: 'Requeue First' })).toBeNull()
  })

  it('keeps the row and shows an alert when the requeue fails', async () => {
    const rows: MockYouTubeVideo[] = [
      { youtube_id: 'vidfailed01', title: 'First', state: 'failed', reason: 'x' },
    ]
    useRows(rows)
    server.use(
      http.post(`${API_BASE}/youtube_connection/videos/:youtubeId/requeue`, () =>
        HttpResponse.json(errorBody('youtube_unavailable', 'x'), { status: 502 }),
      ),
    )
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: 'Requeue First' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't requeue First. Try again.")
    expect(screen.getByRole('list', { name: 'Videos' })).toHaveTextContent('First')
    expect(screen.getByRole('button', { name: 'Requeue First' })).toBeInTheDocument()
  })

  it('shows a done row as summary waiting after its requeue', async () => {
    const rows: MockYouTubeVideo[] = [
      {
        youtube_id: 'vidsummary01',
        title: 'First',
        state: 'done',
        reason: null,
        summary: { state: 'done', text: 'S' },
      },
    ]
    const posts: string[] = []
    useRows(rows)
    server.use(
      http.get(`${API_BASE}/youtube_connection/videos`, () => HttpResponse.json({ videos: rows })),
      http.post(`${API_BASE}/youtube_connection/videos/:youtubeId/requeue`, ({ request, params }) => {
        posts.push(new URL(request.url).pathname)
        const index = rows.findIndex((row) => row.youtube_id === params.youtubeId)
        if (index !== -1) {
          rows[index] = { ...rows[index], summary: { state: 'waiting' } }
        }
        return new HttpResponse(null, { status: 202 })
      }),
    )
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: 'Requeue First' }))

    await vi.waitFor(() => expect(posts).toHaveLength(1))
    await screen.findByRole('img', { name: 'Summary waiting' })
    expect(screen.queryByRole('button', { name: 'Requeue First' })).toBeNull()
  })

  it("moves focus to the card's heading after a requeue", async () => {
    const rows: MockYouTubeVideo[] = [
      { youtube_id: 'vidfocus0001', title: 'First', state: 'failed', reason: 'x' },
    ]
    useRows(rows)
    server.use(
      http.get(`${API_BASE}/youtube_connection/videos`, () => HttpResponse.json({ videos: rows })),
      http.post(`${API_BASE}/youtube_connection/videos/:youtubeId/requeue`, ({ params }) => {
        const index = rows.findIndex((row) => row.youtube_id === params.youtubeId)
        if (index !== -1) {
          rows[index] = { ...rows[index], state: 'waiting', reason: null, summary: null }
        }
        return new HttpResponse(null, { status: 202 })
      }),
    )
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: 'Requeue First' }))

    await screen.findByRole('img', { name: 'Transcript waiting' })
    expect(screen.getByRole('heading', { name: 'YouTube' })).toHaveFocus()
  })
})
