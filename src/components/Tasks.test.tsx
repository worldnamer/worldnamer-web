// The Tasks card. The component is rendered alone with the real queryClient and a mock token; the API is the
// in-memory taskListsHandlers unless a test answers a request itself.
import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, errorBody, REFRESH_TOKEN, taskListsHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { Tasks } from './Tasks'

function renderTasks() {
  return render(
    <QueryClientProvider client={queryClient}>
      <Tasks />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  queryClient.clear()
  clearAccessToken()
  setAccessToken(REFRESH_TOKEN)
})

const rowList = () => screen.getByRole('list', { name: 'Task lists' })
// The list boxes in the row, by accessible name, in display order.
const rowNames = () =>
  within(rowList())
    .queryAllByRole('button')
    .map((button) => button.getAttribute('aria-label'))
const box = (name: string) => within(rowList()).getByRole('button', { name })
const pressed = () =>
  within(rowList())
    .queryAllByRole('button', { pressed: true })
    .map((button) => button.getAttribute('aria-label'))

const shopping = [
  { id: 4, name: 'Shopping List' },
  { id: 2, name: 'Vertex Rim' },
  { id: 9, name: 'Chores' },
]

describe('Tasks', () => {
  it('is a region named "Tasks" with the lists in API order', async () => {
    server.use(...taskListsHandlers(shopping))
    renderTasks()

    const region = screen.getByRole('region', { name: 'Tasks' })
    expect(await within(region).findByRole('button', { name: 'Shopping List' })).toBeInTheDocument()
    expect(rowNames()).toEqual(['Shopping List', 'Vertex Rim', 'Chores'])
  })

  it('shows a loading message until the lists arrive', async () => {
    server.use(...taskListsHandlers(shopping))
    renderTasks()

    expect(screen.getByText('Loading lists...')).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Chores' })
    expect(screen.queryByText('Loading lists...')).not.toBeInTheDocument()
  })

  it.each([
    ['a server error', () => new HttpResponse(null, { status: 500 })],
    ['a network error', () => HttpResponse.error()],
  ])('shows the load error after %s, and no row', async (_label, answer) => {
    server.use(http.get(`${API_BASE}/task_lists`, answer))
    renderTasks()

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your lists. Try reloading the page.")
    expect(screen.queryByRole('list', { name: 'Task lists' })).not.toBeInTheDocument()
  })

  it('shows only the + when there are no lists, and no message', async () => {
    server.use(...taskListsHandlers([]))
    renderTasks()

    await screen.findByRole('list', { name: 'Task lists' })
    expect(rowNames()).toEqual([])
    const region = screen.getByRole('region', { name: 'Tasks' })
    // The edit button is in the heading; the row itself has only the +.
    const buttons = within(region).getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    expect(buttons).toEqual(['Edit lists', 'Add list'])
    expect(screen.getByRole('heading', { name: 'Tasks' }).parentElement).toContainElement(
      screen.getByRole('button', { name: 'Edit lists' }),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Loading lists...')).not.toBeInTheDocument()
  })
})

describe('selecting a list', () => {
  it('selects the first list on load', async () => {
    server.use(...taskListsHandlers(shopping))
    renderTasks()

    await screen.findByRole('button', { name: 'Chores' })
    expect(pressed()).toEqual(['Shopping List'])
    expect(box('Vertex Rim')).toHaveAttribute('aria-pressed', 'false')
  })

  it('selects a list when it is clicked, and only that one', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    renderTasks()

    await user.click(await screen.findByRole('button', { name: 'Vertex Rim' }))

    expect(pressed()).toEqual(['Vertex Rim'])
  })

  it('selects with the keyboard', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    renderTasks()

    ;(await screen.findByRole('button', { name: 'Chores' })).focus()
    await user.keyboard('{Enter}')

    expect(pressed()).toEqual(['Chores'])
  })

  it('selects the first list again after a reload, without asking the server again', async () => {
    const user = userEvent.setup()
    let gets = 0
    server.use(
      http.get(`${API_BASE}/task_lists`, () => {
        gets += 1
      }),
      ...taskListsHandlers(shopping),
    )
    const { unmount } = renderTasks()
    await user.click(await screen.findByRole('button', { name: 'Chores' }))
    unmount()

    renderTasks()

    expect(await screen.findByRole('button', { name: 'Chores' })).toHaveAttribute('aria-pressed', 'false')
    expect(pressed()).toEqual(['Shopping List'])
    expect(gets).toBe(1)
  })

  it('selects the first list when the selected one is gone from the next fetch', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    renderTasks()
    await user.click(await screen.findByRole('button', { name: 'Chores' }))

    // Another tab deleted Chores and the first list.
    server.use(...taskListsHandlers([{ id: 2, name: 'Vertex Rim' }]))
    await queryClient.refetchQueries({ queryKey: ['task_lists'] })

    expect(await screen.findByRole('button', { name: 'Vertex Rim', pressed: true })).toBeInTheDocument()
    expect(rowNames()).toEqual(['Vertex Rim'])
  })
})

describe('names in the row', () => {
  it('shows a blank name as an empty box, read as "Unnamed list", that can be selected', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers([{ id: 1, name: 'Chores' }, { id: 2, name: '' }]))
    renderTasks()

    const blank = await screen.findByRole('button', { name: 'Unnamed list' })
    expect(blank).toHaveTextContent(/^$/)
    expect(blank).toHaveClass('min-w-16')
    expect(blank).not.toHaveAttribute('title')

    await user.click(blank)
    expect(pressed()).toEqual(['Unnamed list'])
  })

  it('cuts a 21-character name to 20 plus "...", with the full name as tooltip and accessible name', async () => {
    const name = 'Vertex Rim Shopping L'
    server.use(...taskListsHandlers([{ id: 1, name }]))
    renderTasks()

    const button = await screen.findByRole('button', { name })
    expect(button).toHaveTextContent('Vertex Rim Shopping ...')
    expect(button).toHaveAttribute('title', name)
    expect(button).toHaveClass('max-w-56')
  })

  it('leaves a 20-character name whole', async () => {
    const name = 'Vertex Rim Shopping!'
    expect(name).toHaveLength(20)
    server.use(...taskListsHandlers([{ id: 1, name }]))
    renderTasks()

    expect((await screen.findByRole('button', { name })).textContent).toBe(name)
  })

  it('cuts a 100-character name, whatever its length, so the box stays inside its maximum width', async () => {
    const name = 'x'.repeat(100)
    server.use(...taskListsHandlers([{ id: 1, name }]))
    renderTasks()

    const button = await screen.findByRole('button', { name })
    expect(button.textContent).toBe(`${'x'.repeat(20)}...`)
    expect(button).toHaveClass('max-w-56')
  })
})

describe('scrolling the row', () => {
  // jsdom does no layout, so these tests give the row one: boxes 100px wide with 8px between them, in a scroller of a
  // chosen width. Setting scrollLeft fires a scroll event, as in a browser, and stays between 0 and the far end.
  const BOX = 100
  const STEP = 108
  let resizeCallbacks: (() => void)[] = []

  beforeEach(() => {
    resizeCallbacks = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resizeCallbacks.push(callback)
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    // On the prototype, so a list box added during the test is laid out too.
    Object.defineProperties(HTMLLIElement.prototype, {
      offsetLeft: {
        configurable: true,
        get(this: HTMLLIElement) {
          return Array.from(this.parentElement?.children ?? []).indexOf(this) * STEP
        },
      },
      offsetWidth: { configurable: true, get: () => BOX },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete (HTMLLIElement.prototype as { offsetLeft?: number }).offsetLeft
    delete (HTMLLIElement.prototype as { offsetWidth?: number }).offsetWidth
  })

  // Gives the scroller its width and tells the row it was resized. Returns the scroller.
  function layOut(width: number) {
    const list = rowList()
    const scroller = list.parentElement!
    const scrollWidth = () => Math.max(width, list.children.length * STEP - (STEP - BOX))
    let left = 0
    Object.defineProperties(scroller, {
      clientWidth: { configurable: true, get: () => width },
      scrollWidth: { configurable: true, get: scrollWidth },
      scrollLeft: {
        configurable: true,
        get: () => left,
        set: (value: number) => {
          left = Math.max(0, Math.min(value, scrollWidth() - width))
          scroller.dispatchEvent(new Event('scroll'))
        },
      },
    })
    act(() => resizeCallbacks.forEach((callback) => callback()))
    return scroller
  }

  const lists = (count: number) => Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `List ${i + 1}` }))
  const leftChevron = () => screen.queryByRole('button', { name: 'Scroll lists left' })
  const rightChevron = () => screen.queryByRole('button', { name: 'Scroll lists right' })

  it('shows no chevrons when every list fits', async () => {
    server.use(...taskListsHandlers(lists(3)))
    renderTasks()
    await screen.findByRole('button', { name: 'List 3' })

    layOut(500)

    expect(leftChevron()).not.toBeInTheDocument()
    expect(rightChevron()).not.toBeInTheDocument()
  })

  it('shows only the right chevron when lists are hidden on the right, and the left one once scrolled', async () => {
    server.use(...taskListsHandlers(lists(5)))
    renderTasks()
    await screen.findByRole('button', { name: 'List 5' })

    const scroller = layOut(250)
    expect(rightChevron()).toBeInTheDocument()
    expect(leftChevron()).not.toBeInTheDocument()

    act(() => {
      scroller.scrollLeft = STEP
    })
    expect(leftChevron()).toBeInTheDocument()
    expect(rightChevron()).toBeInTheDocument()

    act(() => {
      scroller.scrollLeft = 10_000 // the far end
    })
    expect(leftChevron()).toBeInTheDocument()
    expect(rightChevron()).not.toBeInTheDocument()
  })

  it('pages with the chevrons: Right brings the first cut-off list to the left edge, Left shows the one before whole', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(lists(5)))
    renderTasks()
    await screen.findByRole('button', { name: 'List 5' })
    const scroller = layOut(250)

    // Lists 1 and 2 fit in 250px; List 3 is cut off.
    await user.click(rightChevron()!)
    expect(scroller.scrollLeft).toBe(2 * STEP)

    // List 2 is now hidden on the left: the row moves back until it shows whole, starting at a box.
    await user.click(leftChevron()!)
    expect(scroller.scrollLeft).toBe(0)
  })

  it('moves focus to the other chevron when the pressed one disappears at the end', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(lists(5)))
    renderTasks()
    await screen.findByRole('button', { name: 'List 5' })
    layOut(250)

    rightChevron()!.focus()
    await user.keyboard('{Enter}')
    expect(rightChevron()).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(rightChevron()).not.toBeInTheDocument()
    expect(leftChevron()).toHaveFocus()
  })

  it('scrolls a newly added list into view', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(lists(5)))
    renderTasks()
    await screen.findByRole('button', { name: 'List 5' })
    const scroller = layOut(250)

    await user.click(screen.getByRole('button', { name: 'Add list' }))
    await user.keyboard('List 6{Enter}')

    // List 6 sits at 540 to 640, the end of the row, so the row scrolls to its far end (640 - 250) to show it whole.
    await screen.findByRole('button', { name: 'List 6', pressed: true })
    expect(scroller.scrollLeft).toBe(390)
  })

  it('scrolls a list into view when it is selected', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(lists(5)))
    renderTasks()
    await screen.findByRole('button', { name: 'List 5' })
    const scroller = layOut(250)

    // List 4 (324 to 424) is past the right edge; the row scrolls to List 3, from which List 4 shows whole.
    await user.click(screen.getByRole('button', { name: 'List 4' }))

    expect(scroller.scrollLeft).toBe(2 * STEP)
  })
})

// Records each request a handler sees as 'METHOD /path' with its JSON body, then lets the next handler answer it.
// `answer` can answer it instead, for example to hold it or to fail it.
function recordRequests(
  method: 'post' | 'patch' | 'put' | 'delete',
  path: string,
  answer?: () => Response | Promise<Response> | undefined | Promise<undefined>,
) {
  const sent: { path: string; body: unknown; auth: string | null }[] = []
  server.use(
    http[method](`${API_BASE}${path}`, async ({ request }) => {
      const text = await request.clone().text()
      sent.push({
        path: new URL(request.url).pathname,
        body: text === '' ? null : JSON.parse(text),
        auth: request.headers.get('Authorization'),
      })
      return answer ? answer() : undefined
    }),
  )
  return sent
}

// A gate that holds a handler's answer until the test opens it.
function gate() {
  let open!: () => void
  const opened = new Promise<void>((resolve) => (open = resolve))
  return { open, wait: async () => { await opened; return undefined } }
}

describe('adding a list from the row', () => {
  const plus = () => screen.getByRole('button', { name: 'Add list' })
  const draft = () => screen.queryByRole('textbox', { name: 'List name' })

  async function openDraft(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('button', { name: 'Chores' })
    await user.click(plus())
    return draft() as HTMLInputElement
  }

  it('opens a box at the end of the row holding "New List", focused and selected, and disables +', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers([{ id: 1, name: 'Chores' }]))
    renderTasks()

    const input = await openDraft(user)

    expect(input).toHaveValue('New List')
    expect(input).toHaveFocus()
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'New List'.length])
    expect(rowList().lastElementChild).toContainElement(input)
    expect(plus()).toBeDisabled()
  })

  it('saves the typed name on Enter: one POST, the list appears last and selected, and focus returns to +', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers([{ id: 1, name: 'Chores' }]))
    const sent = recordRequests('post', '/task_lists')
    renderTasks()

    await openDraft(user)
    await user.keyboard('Groceries{Enter}')

    expect(await screen.findByRole('button', { name: 'Groceries', pressed: true })).toBeInTheDocument()
    expect(rowNames()).toEqual(['Chores', 'Groceries'])
    expect(sent).toEqual([
      { path: '/api/v1/task_lists', body: { task_list: { name: 'Groceries' } }, auth: `Bearer ${REFRESH_TOKEN}` },
    ])
    expect(draft()).not.toBeInTheDocument()
    expect(plus()).toBeEnabled()
    expect(plus()).toHaveFocus()
  })

  it('keeps the new list after a reload', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers([{ id: 1, name: 'Chores' }]))
    const { unmount } = renderTasks()
    await openDraft(user)
    await user.keyboard('Groceries{Enter}')
    await screen.findByRole('button', { name: 'Groceries' })
    unmount()
    queryClient.clear()

    renderTasks()

    await screen.findByRole('button', { name: 'Groceries' })
    expect(rowNames()).toEqual(['Chores', 'Groceries'])
  })

  it('saves "New List" as it is when Enter is pressed straight away', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers([{ id: 1, name: 'Chores' }]))
    renderTasks()

    await openDraft(user)
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('button', { name: 'New List', pressed: true })).toBeInTheDocument()
  })

  it('works with no lists yet', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers([]))
    renderTasks()
    await screen.findByRole('list', { name: 'Task lists' })

    await user.click(plus())
    await user.keyboard('Groceries{Enter}')

    expect(await screen.findByRole('button', { name: 'Groceries', pressed: true })).toBeInTheDocument()
  })

  it('sends one POST when Enter is followed by the blur it causes, and keeps + disabled while it runs', async () => {
    const user = userEvent.setup()
    const g = gate()
    server.use(...taskListsHandlers([{ id: 1, name: 'Chores' }]))
    const sent = recordRequests('post', '/task_lists', g.wait)
    renderTasks()

    await openDraft(user)
    await user.keyboard('Groceries{Enter}')
    await user.tab() // focus leaves while the request is still out
    await user.keyboard('{Escape}')

    expect(plus()).toBeDisabled()
    g.open()
    await screen.findByRole('button', { name: 'Groceries' })
    expect(sent).toHaveLength(1)
  })

  it('saves once when focus leaves, and leaves focus where it went', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers([{ id: 1, name: 'Chores' }]))
    const sent = recordRequests('post', '/task_lists')
    renderTasks()

    await openDraft(user)
    await user.keyboard('Groceries')
    await user.click(screen.getByRole('heading', { name: 'Tasks' }))

    expect(await screen.findByRole('button', { name: 'Groceries', pressed: true })).toBeInTheDocument()
    expect(sent.map((r) => r.body)).toEqual([{ task_list: { name: 'Groceries' } }])
    expect(plus()).not.toHaveFocus()
  })

  it('saves a blank list when the box is emptied and focus leaves', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers([{ id: 1, name: 'Chores' }]))
    const sent = recordRequests('post', '/task_lists')
    renderTasks()

    await openDraft(user)
    await user.keyboard('{Backspace}')
    await user.tab()

    expect(await screen.findByRole('button', { name: 'Unnamed list', pressed: true })).toBeInTheDocument()
    expect(sent.map((r) => r.body)).toEqual([{ task_list: { name: '' } }])
  })

  it('cancels with Escape: sends nothing, closes the box and returns focus to +', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers([{ id: 1, name: 'Chores' }]))
    const sent = recordRequests('post', '/task_lists')
    renderTasks()

    await openDraft(user)
    await user.keyboard('Groceries{Escape}')
    await user.tab()

    expect(draft()).not.toBeInTheDocument()
    expect(rowNames()).toEqual(['Chores'])
    expect(sent).toEqual([])
  })

  it('returns focus to + after Escape', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers([{ id: 1, name: 'Chores' }]))
    renderTasks()

    await openDraft(user)
    await user.keyboard('{Escape}')

    expect(plus()).toBeEnabled()
    expect(plus()).toHaveFocus()
  })

  it("shows the API's message for a 422, keeps the text, and does not resend on blur until edited", async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers([{ id: 1, name: 'Chores' }]))
    const sent = recordRequests('post', '/task_lists')
    renderTasks()

    await openDraft(user)
    await user.keyboard(`${'x'.repeat(101)}{Enter}`)

    expect(await screen.findByRole('alert')).toHaveTextContent('Name is too long (maximum is 100 characters).')
    expect(draft()).toHaveValue('x'.repeat(101))
    expect(plus()).toBeDisabled()

    await user.tab()
    expect(sent).toHaveLength(1)

    await user.click(draft()!)
    await user.keyboard('{Backspace}')
    await user.tab()
    expect(await screen.findByRole('button', { name: 'x'.repeat(100) })).toBeInTheDocument()
    expect(sent).toHaveLength(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    ['a server error', () => new HttpResponse(null, { status: 500 })],
    ['a network error', () => HttpResponse.error()],
    ['a 422 with no message', () => HttpResponse.json({}, { status: 422 })],
    ['a 400', () => HttpResponse.json(errorBody('bad_request', 'Request body is malformed.'), { status: 400 })],
  ])('shows a generic message after %s and keeps the box and its text', async (_label, answer) => {
    const user = userEvent.setup()
    server.use(http.post(`${API_BASE}/task_lists`, answer), ...taskListsHandlers([{ id: 1, name: 'Chores' }]))
    renderTasks()

    await openDraft(user)
    await user.keyboard('Groceries{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't add the list. Try again.")
    expect(draft()).toHaveValue('Groceries')
    expect(rowNames()).toEqual(['Chores'])
  })

  it('clears the error line when the next save starts', async () => {
    const user = userEvent.setup()
    let posts = 0
    server.use(
      http.post(`${API_BASE}/task_lists`, () => {
        posts += 1
        if (posts === 1) return new HttpResponse(null, { status: 500 })
      }),
      ...taskListsHandlers([{ id: 1, name: 'Chores' }]),
    )
    renderTasks()

    await openDraft(user)
    await user.keyboard('Groceries{Enter}')
    await screen.findByRole('alert')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: 'Groceries' })).toBeInTheDocument()
  })
})

describe('the editor', () => {
  const editButton = () => screen.queryByRole('button', { name: 'Edit lists' })
  const confirm = () => screen.getByRole('button', { name: 'Confirm Lists' })
  const editor = () => screen.queryByRole('group', { name: 'Edit lists' })
  const nameBoxes = () => screen.queryAllByRole('textbox', { name: 'List name' }).map((input) => (input as HTMLInputElement).value)

  it('replaces the row with a name box per list, in order, and Confirm Lists', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers([...shopping, { id: 11, name: '' }]))
    renderTasks()
    await screen.findByRole('button', { name: 'Chores' })

    await user.click(editButton()!)

    expect(editor()).toBeInTheDocument()
    expect(nameBoxes()).toEqual(['Shopping List', 'Vertex Rim', 'Chores', ''])
    expect(confirm()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Shopping List' })).not.toBeInTheDocument()
    expect(editButton()).not.toBeInTheDocument()
  })

  it('shows the full name in the editor, not the cut one', async () => {
    const user = userEvent.setup()
    const name = 'x'.repeat(100)
    server.use(...taskListsHandlers([{ id: 1, name }]))
    renderTasks()
    await screen.findByRole('button', { name })

    await user.click(editButton()!)

    expect(nameBoxes()).toEqual([name])
  })

  it('moves focus into the editor when it opens, and back to the edit button on Confirm Lists', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    renderTasks()
    await screen.findByRole('button', { name: 'Chores' })

    await user.click(editButton()!)
    expect(editor()).toHaveFocus()

    await user.click(confirm())
    expect(editor()).not.toBeInTheDocument()
    expect(rowNames()).toEqual(['Shopping List', 'Vertex Rim', 'Chores'])
    expect(editButton()).toHaveFocus()
  })

  it('keeps the selected list after Confirm Lists, and asks the server for nothing on the way', async () => {
    const user = userEvent.setup()
    const requests: string[] = []
    server.use(...taskListsHandlers(shopping))
    renderTasks()
    await user.click(await screen.findByRole('button', { name: 'Vertex Rim' }))
    server.events.on('request:start', ({ request }) => requests.push(`${request.method} ${request.url}`))

    await user.click(editButton()!)
    await user.click(confirm())
    await new Promise((resolve) => setTimeout(resolve, 50))
    server.events.removeAllListeners()

    expect(pressed()).toEqual(['Vertex Rim'])
    expect(requests).toEqual([])
  })

  it('shows Confirm Lists and no name boxes when there are no lists', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers([]))
    renderTasks()
    await screen.findByRole('list', { name: 'Task lists' })

    await user.click(editButton()!)

    expect(nameBoxes()).toEqual([])
    expect(confirm()).toBeInTheDocument()
  })

  it('disables the edit button until the lists have loaded', async () => {
    const g = gate()
    server.use(http.get(`${API_BASE}/task_lists`, g.wait), ...taskListsHandlers(shopping))
    renderTasks()

    expect(editButton()).toBeDisabled()
    g.open()
    await screen.findByRole('button', { name: 'Chores' })
    expect(editButton()).toBeEnabled()
  })

  it('saves a new list in the row when the edit button is clicked, and the editor shows it once saved', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers([{ id: 1, name: 'Chores' }]))
    const sent = recordRequests('post', '/task_lists')
    renderTasks()
    await screen.findByRole('button', { name: 'Chores' })

    await user.click(screen.getByRole('button', { name: 'Add list' }))
    await user.keyboard('Groceries')
    await user.click(editButton()!)

    await waitFor(() => expect(nameBoxes()).toEqual(['Chores', 'Groceries']))
    expect(sent.map((r) => r.body)).toEqual([{ task_list: { name: 'Groceries' } }])
  })

  it('shows a failed add on the card after the editor has replaced the row', async () => {
    const user = userEvent.setup()
    server.use(
      http.post(`${API_BASE}/task_lists`, () => new HttpResponse(null, { status: 500 })),
      ...taskListsHandlers([{ id: 1, name: 'Chores' }]),
    )
    renderTasks()
    await screen.findByRole('button', { name: 'Chores' })

    await user.click(screen.getByRole('button', { name: 'Add list' }))
    await user.keyboard('Groceries')
    await user.click(editButton()!)

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't add the list. Try again.")
    expect(editor()).toBeInTheDocument()
    expect(nameBoxes()).toEqual(['Chores'])
  })
})

describe('renaming a list in the editor', () => {
  const nameBox = (index: number) => screen.getAllByRole('textbox', { name: 'List name' })[index] as HTMLInputElement
  const nameBoxes = () => screen.queryAllByRole('textbox', { name: 'List name' }).map((input) => (input as HTMLInputElement).value)

  async function openEditor(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('button', { name: 'Chores' })
    await user.click(screen.getByRole('button', { name: 'Edit lists' }))
  }

  // Clears a name box and types into it.
  async function retype(user: ReturnType<typeof userEvent.setup>, index: number, text: string) {
    await user.clear(nameBox(index))
    if (text !== '') await user.type(nameBox(index), text)
  }

  it('sends PATCH /task_lists/<id> on Enter, and the new name shows in the editor and the row', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    const sent = recordRequests('patch', '/task_lists/:id')
    renderTasks()
    await openEditor(user)

    await retype(user, 1, 'Vertex Rim Parts{Enter}')

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toEqual({
      path: '/api/v1/task_lists/2',
      body: { task_list: { name: 'Vertex Rim Parts' } },
      auth: `Bearer ${REFRESH_TOKEN}`,
    })
    expect(nameBox(1)).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Confirm Lists' }))
    expect(await screen.findByRole('button', { name: 'Vertex Rim Parts' })).toBeInTheDocument()
    expect(rowNames()).toEqual(['Shopping List', 'Vertex Rim Parts', 'Chores'])
  })

  it('saves when focus leaves the box, and the name stays after a reload', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    const { unmount } = renderTasks()
    await openEditor(user)

    await retype(user, 2, 'Errands')
    await user.tab()
    await waitFor(() => expect(queryClient.getQueryData(['task_lists'])).toContainEqual({ id: 9, name: 'Errands' }))
    unmount()
    queryClient.clear()

    renderTasks()
    expect(await screen.findByRole('button', { name: 'Errands' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit lists' }))
    expect(nameBoxes()).toEqual(['Shopping List', 'Vertex Rim', 'Errands'])
  })

  it('shows the name as the API saved it, without surrounding spaces', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    renderTasks()
    await openEditor(user)

    await retype(user, 0, '  Groceries  {Enter}')

    await waitFor(() => expect(nameBox(0)).toHaveValue('Groceries'))
  })

  it('allows a blank name, which the row then shows as an empty box', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    const sent = recordRequests('patch', '/task_lists/:id')
    renderTasks()
    await openEditor(user)

    await retype(user, 2, '')
    await user.click(screen.getByRole('button', { name: 'Confirm Lists' }))

    expect(await screen.findByRole('button', { name: 'Unnamed list' })).toBeInTheDocument()
    expect(sent.map((r) => r.body)).toEqual([{ task_list: { name: '' } }])
  })

  it('sends nothing when the name has not changed, or changed only by surrounding spaces', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    const sent = recordRequests('patch', '/task_lists/:id')
    renderTasks()
    await openEditor(user)

    await user.click(nameBox(0))
    await user.keyboard('{Enter}')
    await user.tab()
    await user.type(nameBox(1), '  ')
    await user.keyboard('{Enter}')
    await user.tab()
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(sent).toEqual([])
    expect(nameBox(1)).toHaveValue('Vertex Rim')
  })

  it('puts the saved name back on Escape and sends nothing', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    const sent = recordRequests('patch', '/task_lists/:id')
    renderTasks()
    await openEditor(user)

    await retype(user, 0, 'Groceries{Escape}')
    expect(nameBox(0)).toHaveValue('Shopping List')
    expect(nameBox(0)).toHaveFocus()
    await user.tab()
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(sent).toEqual([])
  })

  it("shows the API's message for a 422, keeps the text, and does not resend on blur until edited", async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    const sent = recordRequests('patch', '/task_lists/:id')
    renderTasks()
    await openEditor(user)

    await retype(user, 0, `${'x'.repeat(101)}{Enter}`)

    expect(await screen.findByRole('alert')).toHaveTextContent('Name is too long (maximum is 100 characters).')
    expect(nameBox(0)).toHaveValue('x'.repeat(101))
    await user.tab()
    expect(sent).toHaveLength(1)
    expect(queryClient.getQueryData(['task_lists'])).toContainEqual({ id: 4, name: 'Shopping List' })
  })

  it.each([
    ['a server error', () => new HttpResponse(null, { status: 500 })],
    ['a network error', () => HttpResponse.error()],
  ])('shows a generic message after %s and keeps the text', async (_label, answer) => {
    const user = userEvent.setup()
    server.use(http.patch(`${API_BASE}/task_lists/:id`, answer), ...taskListsHandlers(shopping))
    renderTasks()
    await openEditor(user)

    await retype(user, 0, 'Groceries{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't rename the list. Try again.")
    expect(nameBox(0)).toHaveValue('Groceries')
  })

  it('fetches the lists again, with no alert, when the list was deleted elsewhere (404)', async () => {
    const user = userEvent.setup()
    let gets = 0
    server.use(
      http.get(`${API_BASE}/task_lists`, () => {
        gets += 1
        // After the first load, Shopping List has been deleted in another tab.
        if (gets > 1) return HttpResponse.json({ task_lists: shopping.slice(1) })
      }),
      http.patch(`${API_BASE}/task_lists/:id`, () =>
        HttpResponse.json(errorBody('not_found', 'Not found.'), { status: 404 }),
      ),
      ...taskListsHandlers(shopping),
    )
    renderTasks()
    await openEditor(user)

    await retype(user, 0, 'Groceries{Enter}')

    await waitFor(() => expect(nameBoxes()).toEqual(['Vertex Rim', 'Chores']))
    expect(gets).toBe(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a failed rename in the row when Confirm Lists closed the editor while it was saving', async () => {
    const user = userEvent.setup()
    const g = gate()
    server.use(
      http.patch(`${API_BASE}/task_lists/:id`, async () => {
        await g.wait()
        return new HttpResponse(null, { status: 500 })
      }),
      ...taskListsHandlers(shopping),
    )
    renderTasks()
    await openEditor(user)

    await retype(user, 0, 'Groceries')
    await user.click(screen.getByRole('button', { name: 'Confirm Lists' }))
    expect(screen.getByRole('list', { name: 'Task lists' })).toBeInTheDocument()
    g.open()

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't rename the list. Try again.")
    expect(rowNames()).toEqual(['Shopping List', 'Vertex Rim', 'Chores'])
  })

  it('shows a rename that succeeds after the editor has closed in the row', async () => {
    const user = userEvent.setup()
    const g = gate()
    server.use(...taskListsHandlers(shopping))
    recordRequests('patch', '/task_lists/:id', g.wait)
    renderTasks()
    await openEditor(user)

    await retype(user, 0, 'Groceries')
    await user.click(screen.getByRole('button', { name: 'Confirm Lists' }))
    g.open()

    expect(await screen.findByRole('button', { name: 'Groceries' })).toBeInTheDocument()
  })
})

describe('reordering lists in the editor', () => {
  const nameBoxes = () => screen.queryAllByRole('textbox', { name: 'List name' }).map((input) => (input as HTMLInputElement).value)
  const arrow = (name: string) => screen.getByRole('button', { name })

  async function openEditor(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('button', { name: 'Chores' })
    await user.click(screen.getByRole('button', { name: 'Edit lists' }))
  }

  it('labels the arrows by list, and disables up on the first list and down on the last', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers([...shopping, { id: 11, name: '' }]))
    renderTasks()
    await openEditor(user)

    expect(arrow("Move 'Shopping List' up")).toBeDisabled()
    expect(arrow("Move 'Shopping List' down")).toBeEnabled()
    expect(arrow("Move 'Chores' up")).toBeEnabled()
    expect(arrow('Move list up')).toBeEnabled()
    expect(arrow('Move list down')).toBeDisabled()
  })

  it('moves a list down at once, sends the whole new order, and the row shows it after a reload', async () => {
    const user = userEvent.setup()
    const g = gate()
    server.use(...taskListsHandlers(shopping))
    const sent = recordRequests('put', '/task_list_order', g.wait)
    const { unmount } = renderTasks()
    await openEditor(user)

    await user.click(arrow("Move 'Shopping List' down"))

    // Shown before the server answers.
    expect(nameBoxes()).toEqual(['Vertex Rim', 'Shopping List', 'Chores'])
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toEqual({ path: '/api/v1/task_list_order', body: { ids: [2, 4, 9] }, auth: `Bearer ${REFRESH_TOKEN}` })
    g.open()
    await user.click(screen.getByRole('button', { name: 'Confirm Lists' }))
    expect(rowNames()).toEqual(['Vertex Rim', 'Shopping List', 'Chores'])

    unmount()
    queryClient.clear()
    renderTasks()
    await screen.findByRole('button', { name: 'Chores' })
    expect(rowNames()).toEqual(['Vertex Rim', 'Shopping List', 'Chores'])
  })

  it('keeps the selected list selected when it moves', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    renderTasks()
    await user.click(await screen.findByRole('button', { name: 'Chores' }))
    await user.click(screen.getByRole('button', { name: 'Edit lists' }))

    await user.click(arrow("Move 'Chores' up"))
    await user.click(screen.getByRole('button', { name: 'Confirm Lists' }))

    expect(rowNames()).toEqual(['Shopping List', 'Chores', 'Vertex Rim'])
    expect(pressed()).toEqual(['Chores'])
  })

  it('keeps focus on the arrow pressed while the list can still move that way', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    renderTasks()
    await openEditor(user)

    await user.click(arrow("Move 'Shopping List' down"))

    expect(nameBoxes()).toEqual(['Vertex Rim', 'Shopping List', 'Chores'])
    expect(arrow("Move 'Shopping List' down")).toHaveFocus()
  })

  it('moves focus to the other arrow when the list reaches the top or the bottom', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    renderTasks()
    await openEditor(user)

    arrow("Move 'Vertex Rim' up").focus()
    await user.keyboard('{Enter}')
    expect(nameBoxes()).toEqual(['Vertex Rim', 'Shopping List', 'Chores'])
    expect(arrow("Move 'Vertex Rim' up")).toBeDisabled()
    expect(arrow("Move 'Vertex Rim' down")).toHaveFocus()

    arrow("Move 'Shopping List' down").focus()
    await user.keyboard('{Enter}')
    expect(nameBoxes()).toEqual(['Vertex Rim', 'Chores', 'Shopping List'])
    expect(arrow("Move 'Shopping List' up")).toHaveFocus()
  })

  it('sends quick moves to the server one at a time, in the order they were made', async () => {
    const user = userEvent.setup()
    const g = gate()
    const order: string[] = []
    server.use(
      http.put(`${API_BASE}/task_list_order`, async ({ request }) => {
        const { ids } = (await request.clone().json()) as { ids: number[] }
        order.push(`arrived ${ids.join(',')}`)
        if (order.length === 1) await g.wait()
        order.push(`answered ${ids.join(',')}`)
      }),
      ...taskListsHandlers(shopping),
    )
    renderTasks()
    await openEditor(user)

    await user.click(arrow("Move 'Shopping List' down"))
    await waitFor(() => expect(order).toEqual(['arrived 2,4,9']))
    await user.click(arrow("Move 'Shopping List' down"))

    // The second move shows at once, although its request waits behind the first.
    expect(nameBoxes()).toEqual(['Vertex Rim', 'Chores', 'Shopping List'])
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(order).toEqual(['arrived 2,4,9'])

    g.open()
    await waitFor(() =>
      expect(order).toEqual(['arrived 2,4,9', 'answered 2,4,9', 'arrived 2,9,4', 'answered 2,9,4']),
    )
  })

  it.each([
    ['a server error', () => new HttpResponse(null, { status: 500 })],
    ['a network error', () => HttpResponse.error()],
    [
      'a 409 (the lists changed elsewhere)',
      () =>
        HttpResponse.json(errorBody('conflict', 'The lists have changed. Reload and try again.'), { status: 409 }),
    ],
  ])("shows an error after %s and fetches the server's order again", async (_label, answer) => {
    const user = userEvent.setup()
    let gets = 0
    server.use(
      http.get(`${API_BASE}/task_lists`, () => {
        gets += 1
      }),
      http.put(`${API_BASE}/task_list_order`, answer),
      ...taskListsHandlers(shopping),
    )
    renderTasks()
    await openEditor(user)

    await user.click(arrow("Move 'Shopping List' down"))

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save the new order. Try again.")
    await waitFor(() => expect(gets).toBe(2))
    await waitFor(() => expect(nameBoxes()).toEqual(['Shopping List', 'Vertex Rim', 'Chores']))
  })

  it('fetches again only once, after the last of several failed moves', async () => {
    const user = userEvent.setup()
    const g = gate()
    let gets = 0
    let puts = 0
    server.use(
      http.get(`${API_BASE}/task_lists`, () => {
        gets += 1
      }),
      http.put(`${API_BASE}/task_list_order`, async () => {
        puts += 1
        if (puts === 1) await g.wait()
        return new HttpResponse(null, { status: 500 })
      }),
      ...taskListsHandlers(shopping),
    )
    renderTasks()
    await openEditor(user)

    await user.click(arrow("Move 'Shopping List' down"))
    await waitFor(() => expect(puts).toBe(1))
    await user.click(arrow("Move 'Shopping List' down"))
    g.open()

    await waitFor(() => expect(puts).toBe(2))
    await waitFor(() => expect(gets).toBe(2))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(gets).toBe(2)
  })
})

describe('deleting a list in the editor', () => {
  const nameBoxes = () => screen.queryAllByRole('textbox', { name: 'List name' }).map((input) => (input as HTMLInputElement).value)

  async function openEditor(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('button', { name: 'Chores' })
    await user.click(screen.getByRole('button', { name: 'Edit lists' }))
  }

  async function askToDelete(user: ReturnType<typeof userEvent.setup>, button: string, title: string) {
    await user.click(screen.getByRole('button', { name: button }))
    return screen.findByRole('alertdialog', { name: title })
  }

  it("asks first, in the shared dialog titled \"Delete 'Chores'?\"", async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    renderTasks()
    await openEditor(user)

    const dialog = await askToDelete(user, 'Delete Chores', "Delete 'Chores'?")

    expect(within(dialog).getByText("This can't be undone.")).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('names a blank list\'s button "Delete list" and asks "Delete this list?", with no empty quotes', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers([...shopping, { id: 11, name: '' }]))
    renderTasks()
    await openEditor(user)

    const dialog = await askToDelete(user, 'Delete list', 'Delete this list?')

    expect(dialog).not.toHaveTextContent("''")
  })

  it('uses the full name in the dialog title, however long', async () => {
    const user = userEvent.setup()
    const name = 'x'.repeat(100)
    server.use(...taskListsHandlers([{ id: 1, name }, { id: 2, name: 'Chores' }]))
    renderTasks()
    await openEditor(user)

    expect(await askToDelete(user, `Delete ${name}`, `Delete '${name}'?`)).toBeInTheDocument()
  })

  it('changes nothing on Cancel, and returns focus to the delete button', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    const sent = recordRequests('delete', '/task_lists/:id')
    renderTasks()
    await openEditor(user)

    const dialog = await askToDelete(user, 'Delete Chores', "Delete 'Chores'?")
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(sent).toEqual([])
    expect(nameBoxes()).toEqual(['Shopping List', 'Vertex Rim', 'Chores'])
    // Radix hands focus back on the next tick.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Chores' })).toHaveFocus())
  })

  it('sends DELETE /task_lists/<id> on confirm, the list goes, and it stays gone after a reload', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    const sent = recordRequests('delete', '/task_lists/:id')
    const { unmount } = renderTasks()
    await openEditor(user)

    const dialog = await askToDelete(user, 'Delete Vertex Rim', "Delete 'Vertex Rim'?")
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(nameBoxes()).toEqual(['Shopping List', 'Chores']))
    expect(sent).toEqual([{ path: '/api/v1/task_lists/2', body: null, auth: `Bearer ${REFRESH_TOKEN}` }])
    // The list's own delete button has gone, so focus goes to the editor's +.
    expect(screen.getByRole('button', { name: 'Add list' })).toHaveFocus()

    unmount()
    queryClient.clear()
    renderTasks()
    await screen.findByRole('button', { name: 'Chores' })
    expect(rowNames()).toEqual(['Shopping List', 'Chores'])
  })

  it('selects the first remaining list when the selected one is deleted', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    renderTasks()
    await user.click(await screen.findByRole('button', { name: 'Chores' }))
    await user.click(screen.getByRole('button', { name: 'Edit lists' }))

    const dialog = await askToDelete(user, 'Delete Chores', "Delete 'Chores'?")
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(nameBoxes()).toEqual(['Shopping List', 'Vertex Rim']))
    await user.click(screen.getByRole('button', { name: 'Confirm Lists' }))

    expect(pressed()).toEqual(['Shopping List'])
  })

  it('keeps the selection when another list is deleted', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    renderTasks()
    await user.click(await screen.findByRole('button', { name: 'Chores' }))
    await user.click(screen.getByRole('button', { name: 'Edit lists' }))

    const dialog = await askToDelete(user, 'Delete Shopping List', "Delete 'Shopping List'?")
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(nameBoxes()).toEqual(['Vertex Rim', 'Chores']))
    await user.click(screen.getByRole('button', { name: 'Confirm Lists' }))

    expect(pressed()).toEqual(['Chores'])
  })

  it('treats a 404 as success: the list goes, the lists are fetched again, and there is no alert', async () => {
    const user = userEvent.setup()
    let gets = 0
    server.use(
      http.get(`${API_BASE}/task_lists`, () => {
        gets += 1
        // After the first load, the server no longer has Chores (deleted in another tab).
        if (gets > 1) return HttpResponse.json({ task_lists: shopping.slice(0, 2) })
      }),
      http.delete(`${API_BASE}/task_lists/:id`, () =>
        HttpResponse.json(errorBody('not_found', 'Not found.'), { status: 404 }),
      ),
      ...taskListsHandlers(shopping),
    )
    renderTasks()
    await openEditor(user)

    const dialog = await askToDelete(user, 'Delete Chores', "Delete 'Chores'?")
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(nameBoxes()).toEqual(['Shopping List', 'Vertex Rim']))
    await waitFor(() => expect(gets).toBe(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    ['Chores', 'Delete Chores', "Delete 'Chores'?", "Couldn't delete 'Chores'. Try again."],
    ['', 'Delete list', 'Delete this list?', "Couldn't delete this list. Try again."],
  ])('shows an error and keeps the list %j after a 500', async (name, button, title, message) => {
    const user = userEvent.setup()
    server.use(
      http.delete(`${API_BASE}/task_lists/:id`, () => new HttpResponse(null, { status: 500 })),
      ...taskListsHandlers([
        { id: 1, name: 'Shopping List' },
        { id: 9, name },
      ]),
    )
    renderTasks()
    await screen.findByRole('button', { name: 'Shopping List' })
    await user.click(screen.getByRole('button', { name: 'Edit lists' }))

    const dialog = await askToDelete(user, button, title)
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(nameBoxes()).toEqual(['Shopping List', name])
  })
})

describe("adding a list from the editor's +", () => {
  const plus = () => screen.getByRole('button', { name: 'Add list' })
  const nameBoxes = () => screen.queryAllByRole('textbox', { name: 'List name' }).map((input) => (input as HTMLInputElement).value)
  const lastNameBox = () => screen.getAllByRole('textbox', { name: 'List name' }).at(-1) as HTMLInputElement

  async function openEditor(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('button', { name: 'Chores' })
    await user.click(screen.getByRole('button', { name: 'Edit lists' }))
  }

  it('opens a box after the last list holding "New List", focused and selected, and disables +', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    renderTasks()
    await openEditor(user)

    await user.click(plus())

    expect(nameBoxes()).toEqual(['Shopping List', 'Vertex Rim', 'Chores', 'New List'])
    expect(lastNameBox()).toHaveFocus()
    expect([lastNameBox().selectionStart, lastNameBox().selectionEnd]).toEqual([0, 'New List'.length])
    expect(plus()).toBeDisabled()
  })

  it('saves on Enter: the list joins the editor with its arrows, and focus returns to +', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    const sent = recordRequests('post', '/task_lists')
    renderTasks()
    await openEditor(user)

    await user.click(plus())
    await user.keyboard('Groceries{Enter}')

    expect(await screen.findByRole('button', { name: "Move 'Groceries' up" })).toBeInTheDocument()
    expect(nameBoxes()).toEqual(['Shopping List', 'Vertex Rim', 'Chores', 'Groceries'])
    expect(sent.map((r) => r.body)).toEqual([{ task_list: { name: 'Groceries' } }])
    expect(plus()).toBeEnabled()
    expect(plus()).toHaveFocus()
  })

  it('saves the box when Confirm Lists is pressed while it has focus, and the row shows the list selected', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    const sent = recordRequests('post', '/task_lists')
    renderTasks()
    await openEditor(user)

    await user.click(plus())
    await user.keyboard('Groceries')
    await user.click(screen.getByRole('button', { name: 'Confirm Lists' }))

    expect(await screen.findByRole('button', { name: 'Groceries', pressed: true })).toBeInTheDocument()
    expect(rowNames()).toEqual(['Shopping List', 'Vertex Rim', 'Chores', 'Groceries'])
    expect(sent).toHaveLength(1)
  })

  it('cancels with Escape: sends nothing and returns focus to +', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    const sent = recordRequests('post', '/task_lists')
    renderTasks()
    await openEditor(user)

    await user.click(plus())
    await user.keyboard('Groceries{Escape}')

    expect(nameBoxes()).toEqual(['Shopping List', 'Vertex Rim', 'Chores'])
    expect(plus()).toHaveFocus()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sent).toEqual([])
  })

  it('works with no lists yet', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers([]))
    renderTasks()
    await screen.findByRole('list', { name: 'Task lists' })
    await user.click(screen.getByRole('button', { name: 'Edit lists' }))

    await user.click(plus())
    await user.keyboard('Groceries{Enter}')

    expect(await screen.findByRole('button', { name: "Move 'Groceries' up" })).toBeDisabled()
    expect(screen.getByRole('button', { name: "Move 'Groceries' down" })).toBeDisabled()
  })

  it('keeps the box and its text and shows the error after a failure', async () => {
    const user = userEvent.setup()
    server.use(http.post(`${API_BASE}/task_lists`, () => new HttpResponse(null, { status: 500 })), ...taskListsHandlers(shopping))
    renderTasks()
    await openEditor(user)

    await user.click(plus())
    await user.keyboard('Groceries{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't add the list. Try again.")
    expect(lastNameBox()).toHaveValue('Groceries')
    expect(plus()).toBeDisabled()
  })
})
