import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '@/App'
import { setSessionFlag } from '@/auth/sessionFlag'
import { clearAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, refreshHandler, youtubeHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'

beforeEach(() => {
  queryClient.clear()
  clearAccessToken()
  localStorage.clear()
})

function renderApp(route: string) {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the YouTube page', () => {
  it('renders the YouTube page for a logged-in user', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...youtubeHandlers())
    renderApp('/youtube')

    expect(await screen.findByRole('region', { name: 'YouTube page' })).toBeInTheDocument()
  })

  const items = [
    { id: 'i1', video_id: 'abcdefghijk', title: 'A summarised video', position: 0 },
    { id: 'i2', video_id: 'bbbbbbbbbbb', title: 'A waiting video', position: 1 },
  ]
  const recorded = [
    {
      youtube_id: 'abcdefghijk',
      title: 'A summarised video',
      state: 'done' as const,
      reason: null,
      summary: { state: 'done' as const, text: 'The summary text.' },
    },
    { youtube_id: 'bbbbbbbbbbb', title: 'A waiting video', state: 'waiting' as const, reason: null },
  ]

  function useConnectedPlaylist() {
    setSessionFlag()
    server.use(
      refreshHandler,
      ...youtubeHandlers('connected', { id: 'PLb', title: 'Music' }, recorded),
      http.get(`${API_BASE}/youtube_connection/playlist/items`, () =>
        HttpResponse.json({
          youtube_connection: { status: 'connected' },
          playlist: { id: 'PLb', title: 'Music', available: true },
          videos: { total_count: items.length, items },
        }),
      ),
    )
  }

  it("lists the playlist's videos with dots and shows the card beside them", async () => {
    useConnectedPlaylist()
    renderApp('/youtube')

    expect(await screen.findByRole('heading', { name: 'Transcripts' })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Summary available' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Transcript waiting' })).toBeInTheDocument()
    expect(screen.getByText('Select a video to read its summary.')).toBeInTheDocument()
  })

  it('fills the card when a row is clicked', async () => {
    const user = userEvent.setup()
    useConnectedPlaylist()
    renderApp('/youtube')

    await user.click(await screen.findByRole('button', { name: 'A summarised video' }))

    expect(await screen.findByText('The summary text.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'A summarised video' })).toBeInTheDocument()
    expect(screen.queryByText('Select a video to read its summary.')).not.toBeInTheDocument()
  })

  it('shows Not Found and requests nothing when logged out', () => {
    renderApp('/youtube')

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
