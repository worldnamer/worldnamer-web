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
    expect(items.map((item) => item.querySelector('span')?.textContent)).toEqual(['Drink water', 'Stretch'])
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
  const names = () =>
    screen
      .getAllByRole('listitem')
      .map((item) => item.querySelector('span')?.textContent)
      .filter(Boolean)
  const plus = () => screen.getByRole('button', { name: 'Add habit' })
  const draft = () => screen.queryByRole('textbox', { name: 'New habit' })

  // Counts POSTs and, optionally, holds the answer until released.
  function countPosts(answer?: () => Response | Promise<Response>) {
    const state = { posts: 0, bodies: [] as unknown[] }
    server.use(
      http.post(`${API_BASE}/habits`, async ({ request }) => {
        state.posts += 1
        state.bodies.push(await request.clone().json())
        return answer ? answer() : undefined
      }),
    )
    return state
  }

  it('opens a focused empty row at the end of the list when + is pressed, and disables +', async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([{ id: 1, name: 'Drink water' }]))
    renderHabits()
    await screen.findByText('Drink water')
    expect(draft()).not.toBeInTheDocument()

    await user.click(plus())

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[1]).getByRole('textbox', { name: 'New habit' })).toHaveFocus()
    expect(draft()).toHaveValue('')
    expect(plus()).toBeDisabled()
  })

  it('commits with Enter: sends the name with the bearer token, appends the row, closes the draft, refocuses +', async () => {
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

    await user.click(plus())
    await user.type(screen.getByRole('textbox', { name: 'New habit' }), 'Stretch{Enter}')

    await waitFor(() => expect(names()).toEqual(['Drink water', 'Stretch']))
    expect(sent).toEqual([
      { auth: `Bearer ${REFRESH_TOKEN}`, type: 'application/json', body: { habit: { name: 'Stretch' } } },
    ])
    expect(draft()).not.toBeInTheDocument()
    expect(plus()).toBeEnabled()
    expect(plus()).toHaveFocus()
  })

  it('works in an empty list: the draft replaces "No habits yet." while open', async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([]))
    renderHabits()
    await screen.findByText('No habits yet.')

    await user.click(plus())
    expect(screen.queryByText('No habits yet.')).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'New habit' }), 'Stretch{Enter}')

    await waitFor(() => expect(names()).toEqual(['Stretch']))
    expect(screen.queryByText('No habits yet.')).not.toBeInTheDocument()
  })

  it('cancels with Escape, discards the text, sends nothing and refocuses +', async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([{ id: 1, name: 'Drink water' }]))
    const sent = countPosts()
    renderHabits()
    await screen.findByText('Drink water')

    await user.click(plus())
    await user.type(screen.getByRole('textbox', { name: 'New habit' }), 'Stretch{Escape}')

    expect(draft()).not.toBeInTheDocument()
    expect(names()).toEqual(['Drink water'])
    expect(plus()).toBeEnabled()
    expect(plus()).toHaveFocus()
    await user.click(plus())
    expect(draft()).toHaveValue('')
    expect(sent.posts).toBe(0)
  })

  it('shows "No habits yet." again after cancelling in an empty list', async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([]))
    renderHabits()
    await screen.findByText('No habits yet.')

    await user.click(plus())
    await user.keyboard('{Escape}')

    expect(screen.getByText('No habits yet.')).toBeInTheDocument()
  })

  it('cancels when the input is empty (or only spaces) and focus leaves, sending nothing', async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([{ id: 1, name: 'Drink water' }]))
    const sent = countPosts()
    renderHabits()
    await screen.findByText('Drink water')

    await user.click(plus())
    await user.type(screen.getByRole('textbox', { name: 'New habit' }), '   ')
    await user.click(screen.getByRole('heading', { name: 'Habits' }))

    expect(draft()).not.toBeInTheDocument()
    expect(plus()).toBeEnabled()
    expect(sent.posts).toBe(0)
  })

  it('commits once when focus leaves an input that has text', async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([{ id: 1, name: 'Drink water' }]))
    const sent = countPosts()
    renderHabits()
    await screen.findByText('Drink water')

    await user.click(plus())
    await user.type(screen.getByRole('textbox', { name: 'New habit' }), 'Stretch')
    await user.tab()

    await waitFor(() => expect(names()).toEqual(['Drink water', 'Stretch']))
    expect(sent.posts).toBe(1)
    expect(sent.bodies).toEqual([{ habit: { name: 'Stretch' } }])
    expect(draft()).not.toBeInTheDocument()
  })

  it('sends one POST when Enter is followed by the blur it causes, and keeps the draft locked while it runs', async () => {
    const user = userEvent.setup()
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(...habitsHandlers([]))
    const sent = countPosts(async () => {
      await held
      return undefined as unknown as Response
    })
    renderHabits()
    await screen.findByText('No habits yet.')

    await user.click(plus())
    await user.type(screen.getByRole('textbox', { name: 'New habit' }), 'Stretch{Enter}')
    await user.tab() // focus leaves while the request is still out
    await user.keyboard('{Escape}')

    expect(plus()).toBeDisabled()
    release()
    await waitFor(() => expect(names()).toEqual(['Stretch']))
    expect(sent.posts).toBe(1)
  })

  it('does not commit a cancelled draft when Escape is followed by the unmount', async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([]))
    const sent = countPosts()
    renderHabits()
    await screen.findByText('No habits yet.')

    await user.click(plus())
    await user.type(screen.getByRole('textbox', { name: 'New habit' }), 'Stretch{Escape}')
    await user.tab()

    expect(sent.posts).toBe(0)
    expect(screen.getByText('No habits yet.')).toBeInTheDocument()
  })

  it("shows the API's message for a 422, keeps the row and the text, and does not retry on blur", async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([{ id: 1, name: 'Drink water' }]))
    const sent = countPosts()
    renderHabits()
    await screen.findByText('Drink water')

    await user.click(plus())
    await user.type(screen.getByRole('textbox', { name: 'New habit' }), `${'x'.repeat(101)}{Enter}`)

    expect(await screen.findByRole('alert')).toHaveTextContent('Name is too long (maximum is 100 characters).')
    expect(draft()).toHaveValue('x'.repeat(101))
    expect(names()).toEqual(['Drink water'])
    expect(plus()).toBeDisabled()

    await user.tab() // blur with the refused text still there
    expect(sent.posts).toBe(1)
    expect(draft()).toHaveValue('x'.repeat(101))
  })

  it('lets Enter on an empty row reach the server, which refuses it, and the message goes away on the next try', async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([]))
    renderHabits()
    await screen.findByText('No habits yet.')

    await user.click(plus())
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent("Name can't be blank.")

    await user.type(screen.getByRole('textbox', { name: 'New habit' }), 'Stretch{Enter}')
    await screen.findByText('Stretch')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    ['a server error', () => new HttpResponse(null, { status: 500 })],
    ['a network error', () => HttpResponse.error()],
    ['a 422 with no message', () => HttpResponse.json({}, { status: 422 })],
    ['a 400', () => HttpResponse.json(errorBody('bad_request', 'Request body is malformed.'), { status: 400 })],
  ])('shows a generic message after %s and keeps the row open', async (_label, answer) => {
    const user = userEvent.setup()
    server.use(http.post(`${API_BASE}/habits`, answer), ...habitsHandlers([]))
    renderHabits()
    await screen.findByText('No habits yet.')

    await user.click(plus())
    await user.type(screen.getByRole('textbox', { name: 'New habit' }), 'Stretch{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
    expect(draft()).toHaveValue('Stretch')
    expect(plus()).toBeDisabled()
  })
})

describe('deleting a habit', () => {
  const names = () => screen.getAllByRole('listitem').map((item) => item.querySelector('span')?.textContent)
  const stretch = [
    { id: 1, name: 'Drink water' },
    { id: 2, name: 'Stretch' },
  ]

  async function openDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Delete Stretch' }))
    return screen.findByRole('alertdialog', { name: "Delete 'Stretch'?" })
  }

  it("asks first, with the title \"Delete 'Stretch'?\" and a description", async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers(stretch))
    renderHabits()

    const dialog = await openDialog(user)

    expect(within(dialog).getByText("This can't be undone.")).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('sends no request on Cancel, and the habit stays', async () => {
    const user = userEvent.setup()
    let deletes = 0
    server.use(
      http.delete(`${API_BASE}/habits/:id`, () => {
        deletes += 1
      }),
      ...habitsHandlers(stretch),
    )
    renderHabits()

    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(deletes).toBe(0)
    expect(names()).toEqual(['Drink water', 'Stretch'])
    // Radix hands focus back on the next tick.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Stretch' })).toHaveFocus())
  })

  it('sends DELETE /habits/<id> on confirm, the habit disappears and focus goes to the + button', async () => {
    const user = userEvent.setup()
    const deleted: string[] = []
    server.use(
      http.delete(`${API_BASE}/habits/:id`, ({ request }) => {
        deleted.push(`${new URL(request.url).pathname} ${request.headers.get('Authorization')}`)
      }),
      ...habitsHandlers(stretch),
    )
    renderHabits()

    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(names()).toEqual(['Drink water']))
    expect(deleted).toEqual([`/api/v1/habits/2 Bearer ${REFRESH_TOKEN}`])
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add habit' })).toHaveFocus()
  })

  it('disables that row while the request runs', async () => {
    const user = userEvent.setup()
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.delete(`${API_BASE}/habits/:id`, async () => {
        await held
      }),
      ...habitsHandlers(stretch),
    )
    renderHabits()

    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(screen.getByRole('button', { name: 'Delete Stretch' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete Drink water' })).toBeEnabled()
    release()
    await waitFor(() => expect(names()).toEqual(['Drink water']))
  })

  it('treats a 404 as success: the habit goes and the list is fetched again', async () => {
    const user = userEvent.setup()
    let gets = 0
    server.use(
      http.get(`${API_BASE}/habits`, () => {
        gets += 1
        // After the first load, the list the server returns no longer has Stretch (deleted in another tab).
        if (gets > 1) return HttpResponse.json({ habits: [{ id: 1, name: 'Drink water' }] })
      }),
      http.delete(`${API_BASE}/habits/:id`, () =>
        HttpResponse.json(errorBody('not_found', 'Habit not found.'), { status: 404 }),
      ),
      ...habitsHandlers(stretch),
    )
    renderHabits()

    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(names()).toEqual(['Drink water']))
    await waitFor(() => expect(gets).toBe(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error and keeps the habit after a 500', async () => {
    const user = userEvent.setup()
    server.use(http.delete(`${API_BASE}/habits/:id`, () => new HttpResponse(null, { status: 500 })), ...habitsHandlers(stretch))
    renderHabits()

    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't delete 'Stretch'. Try again.")
    expect(names()).toEqual(['Drink water', 'Stretch'])
    expect(screen.getByRole('button', { name: 'Delete Stretch' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Add habit' })).toHaveFocus()
  })
})
