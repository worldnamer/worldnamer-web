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
