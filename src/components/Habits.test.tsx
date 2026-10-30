// The habit grid. The component is rendered alone with the real queryClient and a mock token. The clock is faked to
// Thursday 2026-10-29 10:00 local time (the tests run in Los Angeles time) unless a test sets another time; only Date
// is faked, so Testing Library's waiting and user-event keep their real timers.
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccessToken, clearAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, errorBody, habitsHandlers, REFRESH_TOKEN } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { Habits } from './Habits'

// The habit names, read from the row headers of the table, in display order.
const names = () => screen.queryAllByRole('rowheader').map((cell) => cell.textContent)

// The rows of the table body (the header row is left out), including the draft row when it is open.
const bodyRows = () => within(screen.getAllByRole('rowgroup')[1]).getAllByRole('row')

function renderHabits() {
  return render(
    <QueryClientProvider client={queryClient}>
      <Habits />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 29, 10, 0))
  queryClient.clear()
  clearAccessToken()
  setAccessToken(REFRESH_TOKEN)
})

afterEach(() => {
  vi.useRealTimers()
})

// Records the week_start of every GET /habits, then lets the shared handlers answer it.
function recordWeekStarts() {
  const weeks: (string | null)[] = []
  server.use(
    http.get(`${API_BASE}/habits`, ({ request }) => {
      weeks.push(new URL(request.url).searchParams.get('week_start'))
    }),
  )
  return weeks
}

const box = (name: string) => screen.getByRole('checkbox', { name })
const checkedBoxes = () =>
  screen
    .queryAllByRole('checkbox')
    .filter((input) => (input as HTMLInputElement).checked)
    .map((input) => input.getAttribute('aria-label'))
const columnHeaders = () => screen.getAllByRole('columnheader').map((header) => header.textContent)
const todayClass = 'bg-accent/40'

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
    const headers = await within(region).findAllByRole('rowheader')
    expect(headers.map((header) => header.textContent)).toEqual(['Drink water', 'Stretch'])
    expect(within(region).getByRole('table')).toBeInTheDocument()
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
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
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

    const rows = bodyRows()
    expect(rows).toHaveLength(2)
    expect(within(rows[1]).getByRole('textbox', { name: 'New habit' })).toHaveFocus()
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

describe('the week grid', () => {
  const stretch = {
    id: 7,
    name: 'Stretch',
    // The Sunday before and the Monday after the week of Oct 26 must not show.
    completed_dates: ['2026-10-25', '2026-10-26', '2026-10-28', '2026-11-02'],
  }

  it('opens on the current week: asks for week_start=2026-10-26 and shows "Oct 26 – Nov 1" with no year', async () => {
    server.use(...habitsHandlers([stretch]))
    const weeks = recordWeekStarts()
    renderHabits()

    expect(await screen.findByRole('table', { name: 'Habits Oct 26 – Nov 1' })).toBeInTheDocument()
    expect(weeks).toEqual(['2026-10-26'])
    expect(screen.getByText('Oct 26 – Nov 1')).toHaveClass('text-muted-foreground')
  })

  it('has a column per day, Monday to Sunday, with no dates in the headers', async () => {
    server.use(...habitsHandlers([stretch]))
    renderHabits()
    await screen.findByText('Stretch')

    expect(columnHeaders()).toEqual(['Habit', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  })

  it("checks the boxes for the week's completed dates and no others", async () => {
    server.use(...habitsHandlers([{ id: 3, name: 'Drink water' }, stretch]))
    renderHabits()
    await screen.findByText('Stretch')

    expect(checkedBoxes()).toEqual(['Stretch, Monday, October 26', 'Stretch, Wednesday, October 28'])
    expect(screen.getAllByRole('checkbox')).toHaveLength(14)
    expect(box('Stretch, Sunday, November 1')).not.toBeChecked()
    expect(box('Drink water, Monday, October 26')).not.toBeChecked()
  })

  it('names each box by habit and full date, and the boxes are native checkboxes', async () => {
    server.use(...habitsHandlers([stretch]))
    renderHabits()
    await screen.findByText('Stretch')

    const row = bodyRows()[0]
    const labels = within(row)
      .getAllByRole('checkbox')
      .map((input) => input.getAttribute('aria-label'))
    expect(labels).toEqual([
      'Stretch, Monday, October 26',
      'Stretch, Tuesday, October 27',
      'Stretch, Wednesday, October 28',
      'Stretch, Thursday, October 29',
      'Stretch, Friday, October 30',
      'Stretch, Saturday, October 31',
      'Stretch, Sunday, November 1',
    ])
    expect(box('Stretch, Monday, October 26')).toHaveAttribute('type', 'checkbox')
  })

  it('still shows the week of Oct 26 at 23:30 on Sunday, when it is already Monday in UTC', async () => {
    vi.setSystemTime(new Date(2026, 10, 1, 23, 30))
    server.use(...habitsHandlers([stretch]))
    const weeks = recordWeekStarts()
    renderHabits()

    expect(await screen.findByRole('table', { name: 'Habits Oct 26 – Nov 1' })).toBeInTheDocument()
    expect(weeks).toEqual(['2026-10-26'])
  })

  it('shows the week of Nov 2, with no ticks yet, just after midnight on Monday', async () => {
    vi.setSystemTime(new Date(2026, 10, 2, 0, 5))
    const fresh = { id: 7, name: 'Stretch', completed_dates: ['2026-10-26', '2026-10-28'] }
    server.use(...habitsHandlers([fresh]))
    const weeks = recordWeekStarts()
    renderHabits()

    expect(await screen.findByRole('table', { name: 'Habits Nov 2 – Nov 8' })).toBeInTheDocument()
    expect(weeks).toEqual(['2026-11-02'])
    expect(checkedBoxes()).toEqual([])
  })

  it('shows every box empty when the response has no completed_dates', async () => {
    server.use(http.get(`${API_BASE}/habits`, () => HttpResponse.json({ habits: [{ id: 7, name: 'Stretch' }] })))
    renderHabits()
    await screen.findByText('Stretch')

    expect(screen.getAllByRole('checkbox')).toHaveLength(7)
    expect(checkedBoxes()).toEqual([])
  })

  it('shows "No habits yet." and still shows the range when there are no habits', async () => {
    server.use(...habitsHandlers([]))
    renderHabits()

    expect(await screen.findByText('No habits yet.')).toBeInTheDocument()
    expect(screen.getByText('Oct 26 – Nov 1')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it("marks today's column: the Thursday header is the current date and its cells are highlighted", async () => {
    server.use(...habitsHandlers([stretch]))
    renderHabits()
    await screen.findByText('Stretch')

    const headers = screen.getAllByRole('columnheader')
    expect(headers.filter((header) => header.hasAttribute('aria-current')).map((h) => h.textContent)).toEqual(['Thu'])
    expect(screen.getByRole('columnheader', { name: 'Thu' })).toHaveAttribute('aria-current', 'date')
    expect(screen.getByRole('columnheader', { name: 'Thu' })).toHaveClass(todayClass)
    const highlighted = screen
      .getAllByRole('checkbox')
      .filter((input) => input.closest('td')?.classList.contains(todayClass))
      .map((input) => input.getAttribute('aria-label'))
    expect(highlighted).toEqual(['Stretch, Thursday, October 29'])
    expect(headers.filter((header) => header.classList.contains(todayClass))).toHaveLength(1)
  })

  it('highlights the Monday column just after midnight on Monday', async () => {
    vi.setSystemTime(new Date(2026, 10, 2, 0, 5))
    server.use(...habitsHandlers([stretch]))
    renderHabits()
    await screen.findByText('Stretch')

    expect(screen.getByRole('columnheader', { name: 'Mon' })).toHaveAttribute('aria-current', 'date')
    expect(box('Stretch, Monday, November 2').closest('td')).toHaveClass(todayClass)
    expect(box('Stretch, Tuesday, November 3').closest('td')).not.toHaveClass(todayClass)
  })
})

describe('add and delete across cached weeks', () => {
  const lastWeek = ['habits', '2026-10-19']

  it('adds the new habit, with a row of empty boxes, to every cached week', async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([{ id: 1, name: 'Drink water', completed_dates: ['2026-10-27'] }]))
    queryClient.setQueryData(lastWeek, [{ id: 1, name: 'Drink water', completed_dates: ['2026-10-20'] }])
    renderHabits()
    await screen.findByText('Drink water')

    await user.click(screen.getByRole('button', { name: 'Add habit' }))
    await user.type(screen.getByRole('textbox', { name: 'New habit' }), 'Stretch{Enter}')

    await waitFor(() => expect(names()).toEqual(['Drink water', 'Stretch']))
    const stretchBoxes = within(bodyRows()[1]).getAllByRole('checkbox')
    expect(stretchBoxes).toHaveLength(7)
    expect(stretchBoxes.filter((input) => (input as HTMLInputElement).checked)).toEqual([])
    expect(queryClient.getQueryData(lastWeek)).toEqual([
      { id: 1, name: 'Drink water', completed_dates: ['2026-10-20'] },
      { id: 2, name: 'Stretch', completed_dates: [] },
    ])
  })

  it('removes a deleted habit from every cached week', async () => {
    const user = userEvent.setup()
    const both = [
      { id: 1, name: 'Drink water', completed_dates: [] },
      { id: 2, name: 'Stretch', completed_dates: [] },
    ]
    server.use(...habitsHandlers(both))
    queryClient.setQueryData(lastWeek, both)
    renderHabits()

    await user.click(await screen.findByRole('button', { name: 'Delete Stretch' }))
    const dialog = await screen.findByRole('alertdialog', { name: "Delete 'Stretch'?" })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(names()).toEqual(['Drink water']))
    expect(queryClient.getQueryData(lastWeek)).toEqual([{ id: 1, name: 'Drink water', completed_dates: [] }])
  })
})

describe('ticking a day', () => {
  const stretch = { id: 7, name: 'Stretch', completed_dates: ['2026-10-26'] }
  const wednesday = 'Stretch, Wednesday, October 28'
  const completionPath = `${API_BASE}/habits/:id/completions/:date`

  // Records each completion request as 'PUT /api/v1/habits/7/completions/2026-10-28 <auth>', then lets the shared
  // handlers answer it.
  function recordCompletions() {
    const sent: string[] = []
    const record = ({ request }: { request: Request }) => {
      sent.push(`${request.method} ${new URL(request.url).pathname} ${request.headers.get('Authorization')}`)
    }
    server.use(http.put(completionPath, record), http.delete(completionPath, record))
    return sent
  }

  // Counts GET /habits and, after the first, holds each answer until released.
  function holdRefetches() {
    const state = { gets: 0, release: () => {} }
    const held = new Promise<void>((resolve) => (state.release = resolve))
    server.use(
      http.get(`${API_BASE}/habits`, async () => {
        state.gets += 1
        if (state.gets > 1) await held
      }),
    )
    return state
  }

  // A gate that holds a handler's answer until the test opens it, and tells the test when the request arrived.
  function gate() {
    let open!: () => void
    let arrived!: () => void
    const opened = new Promise<void>((resolve) => (open = resolve))
    const requested = new Promise<void>((resolve) => (arrived = resolve))
    return { open, opened, arrived, requested }
  }

  it('ticks the box before the answer arrives and sends PUT /habits/7/completions/2026-10-28 with the token', async () => {
    const user = userEvent.setup()
    const g = gate()
    const sent: string[] = []
    server.use(
      http.put(completionPath, async ({ request }) => {
        sent.push(`${new URL(request.url).pathname} ${request.headers.get('Authorization')}`)
        g.arrived()
        await g.opened
      }),
      ...habitsHandlers([stretch]),
    )
    renderHabits()
    await screen.findByText('Stretch')
    expect(box(wednesday)).not.toBeChecked()

    await user.click(box(wednesday))
    await g.requested

    expect(box(wednesday)).toBeChecked()
    expect(sent).toEqual([`/api/v1/habits/7/completions/2026-10-28 Bearer ${REFRESH_TOKEN}`])
    g.open()
    await waitFor(() => expect(box(wednesday)).toBeChecked())
  })

  it('sends DELETE on a second click, and the box is unticked', async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([stretch]))
    const sent = recordCompletions()
    renderHabits()
    await screen.findByText('Stretch')

    await user.click(box(wednesday))
    await waitFor(() => expect(sent).toHaveLength(1))
    await user.click(box(wednesday))

    await waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[1]).toBe(`DELETE /api/v1/habits/7/completions/2026-10-28 Bearer ${REFRESH_TOKEN}`)
    await waitFor(() => expect(box(wednesday)).not.toBeChecked())
  })

  it('unticks a ticked day with Space on the focused box', async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([stretch]))
    const sent = recordCompletions()
    renderHabits()
    await screen.findByText('Stretch')

    box('Stretch, Monday, October 26').focus()
    await user.keyboard(' ')

    expect(await screen.findByRole('checkbox', { name: 'Stretch, Monday, October 26' })).not.toBeChecked()
    await waitFor(() => expect(sent).toEqual([`DELETE /api/v1/habits/7/completions/2026-10-26 Bearer ${REFRESH_TOKEN}`]))
  })

  it('keeps the tick without fetching the week again once the server has saved it', async () => {
    const user = userEvent.setup()
    let gets = 0
    let puts = 0
    server.use(
      http.get(`${API_BASE}/habits`, () => {
        gets += 1
      }),
      http.put(completionPath, () => {
        puts += 1
      }),
      ...habitsHandlers([stretch]),
    )
    renderHabits()
    await screen.findByText('Stretch')

    await user.click(box(wednesday))

    await waitFor(() => expect(puts).toBe(1))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(gets).toBe(1)
    expect(box(wednesday)).toBeChecked()
  })

  it('runs two quick clicks on one box in order: DELETE waits for the PUT, the box ends unticked, no refetch', async () => {
    const user = userEvent.setup()
    const g = gate()
    const order: string[] = []
    let gets = 0
    server.use(
      http.get(`${API_BASE}/habits`, () => {
        gets += 1
      }),
      http.put(completionPath, async () => {
        order.push('PUT arrived')
        g.arrived()
        await g.opened
        order.push('PUT answered')
      }),
      http.delete(completionPath, () => {
        order.push('DELETE arrived')
      }),
      ...habitsHandlers([stretch]),
    )
    renderHabits()
    await screen.findByText('Stretch')

    await user.click(box(wednesday))
    await g.requested
    await user.click(box(wednesday))

    // The second click shows at once, although its request waits behind the first.
    await waitFor(() => expect(box(wednesday)).not.toBeChecked())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(order).toEqual(['PUT arrived'])

    g.open()
    await waitFor(() => expect(order).toEqual(['PUT arrived', 'PUT answered', 'DELETE arrived']))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(gets).toBe(1)
    expect(box(wednesday)).not.toBeChecked()
  })

  it.each([
    ['a server error', () => new HttpResponse(null, { status: 500 })],
    ['a network error', () => HttpResponse.error()],
  ])('after %s reverts the box before any refetch, outlines the cell and names the box', async (_label, answer) => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([stretch]))
    const refetches = holdRefetches()
    server.use(http.put(completionPath, answer))
    renderHabits()
    await screen.findByText('Stretch')

    await user.click(box(wednesday))

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save Stretch, Wednesday Oct 28. Try again.")
    expect(box(wednesday)).not.toBeChecked()
    expect(box(wednesday).closest('td')).toHaveClass('outline-destructive')
    expect(screen.getAllByRole('checkbox').filter((input) => input.closest('td.outline-destructive'))).toHaveLength(1)
    // The refetch is still held, so the revert did not come from it.
    expect(refetches.gets).toBeLessThanOrEqual(2)
    refetches.release()
  })

  it('places the error line under the heading row and above the grid', async () => {
    const user = userEvent.setup()
    server.use(http.put(completionPath, () => new HttpResponse(null, { status: 500 })), ...habitsHandlers([stretch]))
    renderHabits()
    await screen.findByText('Stretch')

    await user.click(box(wednesday))

    const alert = await screen.findByRole('alert')
    const heading = screen.getByRole('heading', { name: 'Habits' })
    const table = screen.getByRole('table')
    expect(heading.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(alert.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(alert).toHaveClass('text-destructive')
  })

  it('keeps the error line until something clears it, not on a timer', async () => {
    const user = userEvent.setup()
    server.use(http.put(completionPath, () => new HttpResponse(null, { status: 500 })), ...habitsHandlers([stretch]))
    renderHabits()
    await screen.findByText('Stretch')

    await user.click(box(wednesday))
    await screen.findByRole('alert')
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('clears the error line and the outline when the next toggle starts, on any box', async () => {
    const user = userEvent.setup()
    const g = gate()
    server.use(
      http.put(completionPath, ({ params }) => {
        if (params.date === '2026-10-28') return new HttpResponse(null, { status: 500 })
      }),
      http.delete(completionPath, async () => {
        g.arrived()
        await g.opened
      }),
      ...habitsHandlers([stretch]),
    )
    renderHabits()
    await screen.findByText('Stretch')

    await user.click(box(wednesday))
    await screen.findByRole('alert')
    await user.click(box('Stretch, Monday, October 26'))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(box(wednesday).closest('td')).not.toHaveClass('outline-destructive')
    await g.requested
    g.open()
  })

  it('clears the error line and the outline on Dismiss, and returns focus to the box', async () => {
    const user = userEvent.setup()
    server.use(http.put(completionPath, () => new HttpResponse(null, { status: 500 })), ...habitsHandlers([stretch]))
    renderHabits()
    await screen.findByText('Stretch')

    await user.click(box(wednesday))
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(box(wednesday).closest('td')).not.toHaveClass('outline-destructive')
    expect(box(wednesday)).toHaveFocus()
  })

  it('shows only the latest failure', async () => {
    const user = userEvent.setup()
    server.use(http.put(completionPath, () => new HttpResponse(null, { status: 500 })), ...habitsHandlers([stretch]))
    renderHabits()
    await screen.findByText('Stretch')

    await user.click(box(wednesday))
    await screen.findByText("Couldn't save Stretch, Wednesday Oct 28. Try again.")
    await user.click(box('Stretch, Friday, October 30'))

    expect(await screen.findByText("Couldn't save Stretch, Friday Oct 30. Try again.")).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(box(wednesday).closest('td')).not.toHaveClass('outline-destructive')
    expect(box('Stretch, Friday, October 30').closest('td')).toHaveClass('outline-destructive')
  })

  it('fetches the grid again at once when the habit was deleted elsewhere: the row goes and there is no alert', async () => {
    const user = userEvent.setup()
    let gets = 0
    server.use(
      http.get(`${API_BASE}/habits`, () => {
        gets += 1
        // After the first load the habit has been deleted in another tab.
        if (gets > 1) return HttpResponse.json({ habits: [{ id: 3, name: 'Drink water', completed_dates: [] }] })
      }),
      http.put(completionPath, () => HttpResponse.json(errorBody('not_found', 'Habit not found.'), { status: 404 })),
      ...habitsHandlers([{ id: 3, name: 'Drink water' }, stretch]),
    )
    renderHabits()
    await screen.findByText('Stretch')

    await user.click(box(wednesday))

    await waitFor(() => expect(names()).toEqual(['Drink water']))
    expect(gets).toBe(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

})

describe('moving between weeks', () => {
  const stretch = { id: 7, name: 'Stretch', completed_dates: ['2026-10-19', '2026-10-28', '2026-11-03'] }
  const previous = () => screen.getByRole('button', { name: 'Previous week' })
  const next = () => screen.getByRole('button', { name: 'Next week' })
  const tableNamed = (range: string) => screen.findByRole('table', { name: `Habits ${range}` })

  it("shows the next week's range and ticks after Next, asking for week_start=2026-11-02", async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([stretch]))
    const weeks = recordWeekStarts()
    renderHabits()
    await tableNamed('Oct 26 – Nov 1')

    await user.click(next())

    await tableNamed('Nov 2 – Nov 8')
    await waitFor(() => expect(checkedBoxes()).toEqual(['Stretch, Tuesday, November 3']))
    expect(weeks).toEqual(['2026-10-26', '2026-11-02'])
    expect(screen.getByText('Nov 2 – Nov 8')).toBeInTheDocument()
  })

  it('does not ask again for a week it fetched moments ago when going back to it', async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([stretch]))
    const weeks = recordWeekStarts()
    renderHabits()
    await tableNamed('Oct 26 – Nov 1')

    await user.click(next())
    await tableNamed('Nov 2 – Nov 8')
    await user.click(previous())

    await tableNamed('Oct 26 – Nov 1')
    expect(weeks).toEqual(['2026-10-26', '2026-11-02'])
  })

  it('reaches Oct 19 – Oct 25 with Previous twice, using the keyboard', async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([stretch]))
    renderHabits()
    await tableNamed('Oct 26 – Nov 1')

    previous().focus()
    await user.keyboard('{Enter}')
    await tableNamed('Oct 19 – Oct 25')
    await user.keyboard(' ')
    await tableNamed('Oct 12 – Oct 18')
    next().focus()
    await user.keyboard('{Enter}')

    await tableNamed('Oct 19 – Oct 25')
    await waitFor(() => expect(checkedBoxes()).toEqual(['Stretch, Monday, October 19']))
  })

  it('shows the year once a week reaches into a past year', async () => {
    const user = userEvent.setup()
    vi.setSystemTime(new Date(2026, 0, 7, 12, 0))
    server.use(...habitsHandlers([stretch]))
    renderHabits()
    await tableNamed('Jan 5 – Jan 11')

    await user.click(previous())
    await tableNamed('Dec 29 – Jan 4, 2026')
    await user.click(previous())
    await tableNamed('Dec 22 – Dec 28, 2025')
  })

  it('shows the next year once a week reaches into it', async () => {
    const user = userEvent.setup()
    vi.setSystemTime(new Date(2026, 11, 23, 12, 0))
    server.use(...habitsHandlers([stretch]))
    renderHabits()
    await tableNamed('Dec 21 – Dec 27')

    await user.click(next())

    await tableNamed('Dec 28 – Jan 3, 2027')
  })

  it("sends a past week's date when a box is ticked there, and the tick stays without a refetch", async () => {
    const user = userEvent.setup()
    const sent: string[] = []
    let gets = 0
    server.use(
      http.get(`${API_BASE}/habits`, () => {
        gets += 1
      }),
      http.put(`${API_BASE}/habits/:id/completions/:date`, ({ request }) => {
        sent.push(new URL(request.url).pathname)
      }),
      ...habitsHandlers([stretch]),
    )
    renderHabits()
    await tableNamed('Oct 26 – Nov 1')
    await user.click(previous())
    await tableNamed('Oct 19 – Oct 25')
    await waitFor(() => expect(box('Stretch, Wednesday, October 21')).toBeEnabled())

    await user.click(box('Stretch, Wednesday, October 21'))

    await waitFor(() => expect(sent).toEqual(['/api/v1/habits/7/completions/2026-10-21']))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(gets).toBe(2)
    expect(box('Stretch, Wednesday, October 21')).toBeChecked()
  })

  it('disables the boxes and marks the table busy while the new week loads', async () => {
    const user = userEvent.setup()
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get(`${API_BASE}/habits`, async ({ request }) => {
        if (new URL(request.url).searchParams.get('week_start') === '2026-11-02') await held
      }),
      ...habitsHandlers([stretch]),
    )
    renderHabits()
    const table = await tableNamed('Oct 26 – Nov 1')
    expect(table).toHaveAttribute('aria-busy', 'false')
    expect(screen.getAllByRole('checkbox').every((input) => !(input as HTMLInputElement).disabled)).toBe(true)

    await user.click(next())

    expect(await tableNamed('Nov 2 – Nov 8')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getAllByRole('checkbox')).toHaveLength(7)
    expect(screen.getAllByRole('checkbox').every((input) => (input as HTMLInputElement).disabled)).toBe(true)
    release()
    await waitFor(() => expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false'))
    expect(screen.getAllByRole('checkbox').every((input) => !(input as HTMLInputElement).disabled)).toBe(true)
  })

  it('announces the range politely', async () => {
    server.use(...habitsHandlers([stretch]))
    renderHabits()
    await tableNamed('Oct 26 – Nov 1')

    expect(screen.getByText('Oct 26 – Nov 1')).toHaveAttribute('aria-live', 'polite')
  })

  it("marks no column as today's after Next or Previous, and marks it again on coming back", async () => {
    const user = userEvent.setup()
    server.use(...habitsHandlers([stretch]))
    renderHabits()
    await tableNamed('Oct 26 – Nov 1')
    const current = () => screen.getAllByRole('columnheader').filter((header) => header.hasAttribute('aria-current'))
    const highlighted = () => document.querySelectorAll(`.${CSS.escape(todayClass)}`)

    await user.click(next())
    await tableNamed('Nov 2 – Nov 8')
    expect(current()).toEqual([])
    expect(highlighted()).toHaveLength(0)

    await user.click(previous())
    await user.click(previous())
    await tableNamed('Oct 19 – Oct 25')
    expect(current()).toEqual([])
    expect(highlighted()).toHaveLength(0)

    await user.click(next())
    await tableNamed('Oct 26 – Nov 1')
    expect(current().map((header) => header.textContent)).toEqual(['Thu'])
  })

  it('clears the error line and the outline when the week changes', async () => {
    const user = userEvent.setup()
    server.use(
      http.put(`${API_BASE}/habits/:id/completions/:date`, () => new HttpResponse(null, { status: 500 })),
      ...habitsHandlers([stretch]),
    )
    renderHabits()
    await tableNamed('Oct 26 – Nov 1')

    await user.click(box('Stretch, Friday, October 30'))
    await screen.findByRole('alert')
    await user.click(next())

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(previous())
    await tableNamed('Oct 26 – Nov 1')
    expect(box('Stretch, Friday, October 30').closest('td')).not.toHaveClass('outline-destructive')
  })
})
