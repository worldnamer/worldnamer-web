import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { API_BASE, REFRESH_TOKEN, youtubeVideosHandlers, type MockYouTubeVideo } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { YouTubeTranscriptsCard } from '@/components/YouTubeTranscriptsCard'

const ID = 'abcdefghijk'

function renderCard(videoId: string | null = ID) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <YouTubeTranscriptsCard videoId={videoId} />
    </QueryClientProvider>,
  )
}

function video(overrides: Partial<MockYouTubeVideo>): MockYouTubeVideo {
  return { youtube_id: ID, title: 'A video', state: 'done', reason: null, ...overrides }
}

describe('the transcripts card', () => {
  beforeEach(() => {
    clearAccessToken()
    setAccessToken(REFRESH_TOKEN)
  })

  it('asks the user to select a video before one is selected', async () => {
    server.use(...youtubeVideosHandlers([video({ summary: { state: 'done', text: 'Hidden.' } })]))
    renderCard(null)

    await screen.findByText('Select a video to read its summary.')
    expect(screen.getByRole('heading', { name: 'Transcripts' })).toBeInTheDocument()
    expect(screen.queryByText('Hidden.')).toBeNull()
  })

  it('shows the summary text of a selected green video', async () => {
    server.use(...youtubeVideosHandlers([video({ title: 'Alpha', summary: { state: 'done', text: 'A short summary.' } })]))
    renderCard()

    await screen.findByRole('heading', { name: 'Alpha' })
    expect(screen.queryByRole('heading', { name: 'Transcripts' })).toBeNull()
    expect(screen.getByText('A short summary.')).toBeInTheDocument()
    expect(screen.queryByText('Select a video to read its summary.')).toBeNull()
  })

  it('shows Nothing to summarise. for a selected video with nothing to summarise', async () => {
    server.use(...youtubeVideosHandlers([video({ summary: { state: 'nothing_to_summarise' } })]))
    renderCard()

    await screen.findByText('Nothing to summarise.')
  })

  it.each([
    ['timed_out', 'No summary: The summary took too long.'],
    ['model_unauthorized', 'No summary: The summary service refused the request.'],
    ['bad_response', 'No summary: The summary service gave an answer we could not read.'],
    ['not_a_known_word', 'No summary: Something went wrong.'],
  ])('shows the reason for a selected failed summary', async (reason, line) => {
    server.use(...youtubeVideosHandlers([video({ summary: { state: 'failed', reason } })]))
    renderCard()

    await screen.findByText(line)
  })

  it.each([
    ['blocked', 'YouTube blocked the request.'],
    ['timed_out', 'The request timed out.'],
    ['unavailable', 'The video is unavailable.'],
    ['proxy_refused', 'The proxy refused the request.'],
    ['youtube_error', 'YouTube returned an error.'],
    ['busy', 'The transcript service was busy.'],
    ['unauthorized', 'The transcript service refused the request.'],
    ['unreachable', 'The transcript service could not be reached.'],
    ['bad_response', 'The transcript service sent an unexpected answer.'],
    ['unknown', 'Something went wrong.'],
  ])('shows the reason for a selected failed transcript', async (reason, sentence) => {
    server.use(
      ...youtubeVideosHandlers([video({ state: 'failed', reason: reason as MockYouTubeVideo['reason'] })]),
    )
    renderCard()

    await screen.findByText(sentence)
  })

  it('shows No captions. for a selected video without captions', async () => {
    server.use(...youtubeVideosHandlers([video({ state: 'no_captions' })]))
    renderCard()

    await screen.findByText('No captions.')
  })

  it('falls back to Something went wrong. for an unknown reason', async () => {
    server.use(
      ...youtubeVideosHandlers([video({ state: 'failed', reason: 'something_new' as MockYouTubeVideo['reason'] })]),
    )
    renderCard()

    await screen.findByText('Something went wrong.')
  })

  it("shows a summary's HTML as literal text and creates no element", async () => {
    const hostile = '<img src=x onerror=alert(1)>'
    server.use(...youtubeVideosHandlers([video({ title: '<b>bold</b>', summary: { state: 'done', text: hostile } })]))
    const { container } = renderCard()

    await screen.findByText(hostile)
    expect(screen.getByRole('heading', { name: '<b>bold</b>' })).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
  })

  it('keeps paragraph breaks by styling, not markup', async () => {
    server.use(...youtubeVideosHandlers([video({ summary: { state: 'done', text: 'One.\n\nTwo.' } })]))
    renderCard()

    const text = await screen.findByText(/One\./)
    expect(text).toHaveClass('whitespace-pre-line')
    expect(text.querySelector('br')).toBeNull()
  })

  it('still shows the loading and error lines', async () => {
    server.use(
      http.get(`${API_BASE}/youtube_connection/videos`, () =>
        HttpResponse.json({ error: { code: 'server_error', message: 'Broken.' } }, { status: 500 }),
      ),
    )
    renderCard()

    expect(screen.getByText('Loading transcripts...')).toBeInTheDocument()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe("Couldn't load the transcripts. Try reloading the page.")
  })
})
