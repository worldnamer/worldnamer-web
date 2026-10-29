// Habit list (web scenarios 1, 2 and 4). The component is rendered alone with the real queryClient and a mock token.
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken, clearAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, errorBody, habitsHandlers, REFRESH_TOKEN } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { Habits } from './Habits'

function renderHabits() {
  return render(
    <QueryClientProvider client={queryClient}>
      <Habits />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  queryClient.clear()
  clearAccessToken()
  setAccessToken(REFRESH_TOKEN)
})

describe('Habits', () => {
  it('shows a region "Habits" with the names in API order', async () => {
    server.use(
      ...habitsHandlers([
        { id: 7, name: 'Drink water' },
        { id: 3, name: 'Stretch' },
      ]),
    )
    renderHabits()

    const region = screen.getByRole('region', { name: 'Habits' })
    const items = await within(region).findAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['Drink water', 'Stretch'])
  })

  it('shows a loading message until the list arrives', async () => {
    server.use(...habitsHandlers([{ id: 1, name: 'Stretch' }]))
    renderHabits()

    expect(screen.getByText('Loading habits...')).toBeInTheDocument()
    await screen.findByText('Stretch')
    expect(screen.queryByText('Loading habits...')).not.toBeInTheDocument()
  })

  it('shows "No habits yet." when there are none', async () => {
    server.use(...habitsHandlers([]))
    renderHabits()

    expect(await screen.findByText('No habits yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it.each([
    ['a server error', () => new HttpResponse(null, { status: 500 })],
    ['a network error', () => HttpResponse.error()],
  ])('shows the error alert after %s', async (_label, answer) => {
    server.use(http.get(`${API_BASE}/habits`, answer))
    renderHabits()

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your habits. Try reloading the page.")
    expect(screen.queryByText('No habits yet.')).not.toBeInTheDocument()
  })
})

describe('adding a habit', () => {
  const names = () => screen.getAllByRole('listitem').map((item) => item.textContent)

  it('sends the name with the bearer token, appends the habit and clears the input', async () => {
    const user = userEvent.setup()
    const sent: { auth: string | null; type: string | null; body: unknown }[] = []
    server.use(
      http.post(`${API_BASE}/habits`, async ({ request }) => {
        sent.push({
          auth: request.headers.get('Authorization'),
          type: request.headers.get('Content-Type'),
          body: await request.clone().json(),
        })
        return undefined
      }),
      ...habitsHandlers([{ id: 1, name: 'Drink water' }]),
    )
    renderHabits()
    await screen.findByText('Drink water')

    await user.type(screen.getByLabelText('New habit'), 'Stretch')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(names()).toEqual(['Drink water', 'Stretch']))
    expect(sent).toEqual([
      { auth: `Bearer ${REFRESH_TOKEN}`, type: 'application/json', body: { habit: { name: 'Stretch' } } },
    ])
    expect(screen.getByLabelText('New habit')).toHaveValue('')
    expect(screen.getByLabelText('New habit')).toHaveFocus()
  })

  it('submits with Enter and shows the first habit in an empty list', async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([]))
    renderHabits()
    await screen.findByText('No habits yet.')

    await user.type(screen.getByLabelText('New habit'), 'Stretch{Enter}')

    expect(await screen.findByRole('listitem')).toHaveTextContent('Stretch')
    expect(screen.queryByText('No habits yet.')).not.toBeInTheDocument()
  })

  it("shows the API's message for a 422, keeps the text and leaves the list unchanged", async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([{ id: 1, name: 'Drink water' }]))
    renderHabits()
    await screen.findByText('Drink water')

    await user.type(screen.getByLabelText('New habit'), 'x'.repeat(101))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Name is too long (maximum is 100 characters).')
    expect(screen.getByLabelText('New habit')).toHaveValue('x'.repeat(101))
    expect(names()).toEqual(['Drink water'])
  })

  it('refuses a blank name with the API message, and the message goes away on the next try', async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([]))
    renderHabits()
    await screen.findByText('No habits yet.')

    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Name can't be blank.")

    await user.type(screen.getByLabelText('New habit'), 'Stretch{Enter}')
    await screen.findByText('Stretch')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    ['a server error', () => new HttpResponse(null, { status: 500 })],
    ['a network error', () => HttpResponse.error()],
    ['a 422 with no message', () => HttpResponse.json({}, { status: 422 })],
    ['a 400', () => HttpResponse.json(errorBody('bad_request', 'Request body is malformed.'), { status: 400 })],
  ])('shows a generic message after %s', async (_label, answer) => {
    const user = userEvent.setup()
    server.use(http.post(`${API_BASE}/habits`, answer), ...habitsHandlers([]))
    renderHabits()
    await screen.findByText('No habits yet.')

    await user.type(screen.getByLabelText('New habit'), 'Stretch')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
    expect(screen.getByLabelText('New habit')).toHaveValue('Stretch')
    expect(screen.getByText('No habits yet.')).toBeInTheDocument()
  })

  it('sends one POST for two quick clicks, and disables Add while the request runs', async () => {
    const user = userEvent.setup()
    let posts = 0
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post(`${API_BASE}/habits`, async () => {
        posts += 1
        await held
        return undefined
      }),
      ...habitsHandlers([]),
    )
    renderHabits()
    await screen.findByText('No habits yet.')

    await user.type(screen.getByLabelText('New habit'), 'Stretch')
    await user.dblClick(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    release()
    await screen.findByText('Stretch')
    expect(posts).toBe(1)
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled()
  })
})
