import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { API_BASE, REFRESH_TOKEN, youtubeVideosHandlers, type MockYouTubeVideo } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { YouTubeTranscriptsCard } from '@/components/YouTubeTranscriptsCard'

function renderCard() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <YouTubeTranscriptsCard />
    </QueryClientProvider>,
  )
}

function video(overrides: Partial<MockYouTubeVideo>): MockYouTubeVideo {
  return { youtube_id: 'abcdefghijk', title: 'A video', state: 'waiting', reason: null, ...overrides }
}

describe('the transcripts card', () => {
  beforeEach(() => {
    clearAccessToken()
    setAccessToken(REFRESH_TOKEN)
  })

  it("shows each video's title with the state of its transcript", async () => {
    server.use(
      ...youtubeVideosHandlers([
        video({ youtube_id: 'aaaaaaaaaaa', title: 'Alpha', state: 'waiting' }),
        video({ youtube_id: 'bbbbbbbbbbb', title: 'Bravo', state: 'working' }),
        video({ youtube_id: 'ccccccccccc', title: 'Charlie', state: 'done' }),
        video({ youtube_id: 'ddddddddddd', title: 'Delta', state: 'no_captions' }),
        video({ youtube_id: 'eeeeeeeeeee', title: 'Echo', state: 'failed', reason: 'blocked' }),
      ]),
    )
    renderCard()

    const list = await screen.findByRole('list', { name: 'Videos' })
    const items = within(list).getAllByRole('listitem')
    const expected = [
      ['Alpha', 'Waiting'],
      ['Bravo', 'Working'],
      ['Charlie', 'Done'],
      ['Delta', 'No captions'],
      ['Echo', 'Failed'],
    ]
    expect(items).toHaveLength(expected.length)
    expected.forEach(([title, label], index) => {
      // getByText throws when the text is missing, so each call is an assertion.
      within(items[index]).getByText(title)
      within(items[index]).getByText(label)
    })
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
  ])('says in plain words why a transcript failed', async (reason, sentence) => {
    server.use(
      ...youtubeVideosHandlers([
        video({ title: 'Failed video', state: 'failed', reason: reason as MockYouTubeVideo['reason'] }),
      ]),
    )
    renderCard()

    const list = await screen.findByRole('list', { name: 'Videos' })
    const [item] = within(list).getAllByRole('listitem')
    // getByText throws when the sentence is missing, so the call is the assertion.
    within(item).getByText(sentence)
  })

  it('falls back to a generic line for a reason it does not know', async () => {
    server.use(
      ...youtubeVideosHandlers([
        video({
          youtube_id: 'aaaaaaaaaaa',
          title: 'Alpha',
          state: 'failed',
          reason: 'something_new' as MockYouTubeVideo['reason'],
        }),
        video({ youtube_id: 'bbbbbbbbbbb', title: 'Bravo', state: 'done', reason: null }),
      ]),
    )
    renderCard()

    const list = await screen.findByRole('list', { name: 'Videos' })
    const [failed, done] = within(list).getAllByRole('listitem')
    // getByText throws when the sentence is missing, so the call is the assertion.
    within(failed).getByText('Something went wrong.')
    expect(within(done).queryByText('Something went wrong.')).toBeNull()
    expect(screen.getAllByText('Something went wrong.')).toHaveLength(1)
  })

  it('says there are no videos yet when none are recorded', async () => {
    server.use(...youtubeVideosHandlers([]))
    renderCard()

    await screen.findByText('No videos recorded yet.')
    expect(screen.queryByRole('list', { name: 'Videos' })).toBeNull()
  })

  it('shows an alert when the videos cannot be loaded', async () => {
    server.use(
      http.get(`${API_BASE}/youtube_connection/videos`, () =>
        HttpResponse.json({ error: { code: 'server_error', message: 'Broken.' } }, { status: 500 }),
      ),
    )
    renderCard()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe("Couldn't load the transcripts. Try reloading the page.")
  })

  it('shows a title as plain text, never as markup', async () => {
    server.use(...youtubeVideosHandlers([video({ title: '<b>bold</b>' })]))
    const { container } = renderCard()

    await screen.findByText('<b>bold</b>')
    expect(container.querySelector('b')).toBeNull()
  })
})

describe('the summary under each video', () => {
  beforeEach(() => {
    clearAccessToken()
    setAccessToken(REFRESH_TOKEN)
  })

  async function firstItem(videos: MockYouTubeVideo[]) {
    server.use(...youtubeVideosHandlers(videos))
    renderCard()
    const list = await screen.findByRole('list', { name: 'Videos' })
    return within(list).getAllByRole('listitem')[0]
  }

  it.each([
    [{ state: 'waiting' }, 'Summary waiting'],
    [{ state: 'working' }, 'Summarising'],
    [{ state: 'done', text: 'A short summary.' }, 'A short summary.'],
    [{ state: 'nothing_to_summarise' }, 'Nothing to summarise.'],
    [{ state: 'failed', reason: 'timed_out' }, 'No summary: The summary took too long.'],
    [{ state: 'failed', reason: 'model_unauthorized' }, 'No summary: The summary service refused the request.'],
    [{ state: 'failed', reason: 'bad_response' }, 'No summary: The summary service gave an answer we could not read.'],
    [{ state: 'failed', reason: 'not_a_known_word' }, 'No summary: Something went wrong.'],
    [{ state: 'failed' }, 'No summary: Something went wrong.'],
  ])('shows the summary %j', async (summary, line) => {
    const item = await firstItem([video({ state: 'done', summary })])
    // getByText throws when the line is missing, so the call is the assertion.
    within(item).getByText(line)
  })

  it('shows nothing extra when the summary is null or missing', async () => {
    const item = await firstItem([video({ title: 'Plain', state: 'done', summary: null })])
    within(item).getByText('Plain')
    expect(item.querySelectorAll('p')).toHaveLength(0)
  })

  it('renders as before when the API does not send the field', async () => {
    const item = await firstItem([video({ title: 'Old API', state: 'done' })])
    within(item).getByText('Done')
    expect(item.querySelectorAll('p')).toHaveLength(0)
  })

  it('keeps paragraph breaks by styling, not markup', async () => {
    const item = await firstItem([video({ state: 'done', summary: { state: 'done', text: 'One.\n\nTwo.' } })])
    expect(item.querySelector('p')).toHaveClass('whitespace-pre-line')
  })

  it('shows HTML in the summary as literal text and creates no element', async () => {
    const hostile = '<img src=x onerror=alert(1)>'
    const item = await firstItem([video({ state: 'done', summary: { state: 'done', text: hostile } })])
    within(item).getByText(hostile)
    expect(item.querySelector('img')).toBeNull()
  })
})
