// The tasks area of the Tasks card. The whole card is rendered, since the row chooses the list, with the real
// queryClient and a mock token; the API is the in-memory taskListsHandlers and tasksHandlers unless a test answers a
// request itself.
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, errorBody, REFRESH_TOKEN, taskListsHandlers, tasksHandlers, type MockTask } from '@/mocks/handlers'
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

const lists = [
  { id: 4, name: 'Shopping List' },
  { id: 9, name: 'Chores' },
]
const shoppingTasks: MockTask[] = [
  { id: 1, text: 'Milk', done: false },
  { id: 3, text: 'Eggs', done: true },
]
const choresTasks: MockTask[] = [{ id: 2, text: 'Sweep', done: false }]

// Both lists and their tasks.
const both = () => [...taskListsHandlers(lists), ...tasksHandlers({ 4: shoppingTasks, 9: choresTasks })]

// The list ids of every GET of tasks, in the order they were sent. Register it after the handlers that answer, since
// server.use puts the latest first and this one passes the request on.
function recordTaskGets() {
  const ids: string[] = []
  server.use(
    http.get(`${API_BASE}/task_lists/:listId/tasks`, ({ params }) => {
      ids.push(String(params.listId))
    }),
  )
  return ids
}

// Records every request to `path` with `method` (its path and JSON body) and passes it on, or answers it with
// `answer` when given. Register it after the handlers that answer, as for recordTaskGets.
function recordRequests(method: 'post' | 'patch', path: string, answer?: () => Response) {
  const sent: { path: string; body: unknown }[] = []
  server.use(
    http[method](`${API_BASE}${path}`, async ({ request }) => {
      sent.push({ path: new URL(request.url).pathname, body: await request.clone().json() })
      return answer?.()
    }),
  )
  return sent
}

// A gate that holds a handler's answer until the test opens it.
function gate() {
  let open!: () => void
  const opened = new Promise<void>((resolve) => (open = resolve))
  return { open, wait: () => opened }
}

const area = (listName: string) => screen.getByRole('list', { name: `${listName} tasks` })
// The tasks in an area, by their checkbox's accessible name, in display order.
const taskNames = (listName: string) =>
  within(area(listName))
    .queryAllByRole('checkbox')
    .map((box) => box.getAttribute('aria-label'))

describe('the tasks of the selected list', () => {
  it("shows the first list's tasks on load, oldest first, in a list named for it", async () => {
    server.use(...both())
    renderTasks()

    expect(await screen.findByRole('list', { name: 'Shopping List tasks' })).toBeInTheDocument()
    expect(taskNames('Shopping List')).toEqual(['Milk', 'Eggs'])
    expect(screen.queryByText('Sweep')).not.toBeInTheDocument()
  })

  it('shows a checked task as a checked box with its text struck through, and an unchecked one plain', async () => {
    server.use(...both())
    renderTasks()

    const eggs = await screen.findByRole('checkbox', { name: 'Eggs' })
    expect(eggs).toBeChecked()
    expect(screen.getByText('Eggs')).toHaveClass('line-through')
    expect(screen.getByRole('checkbox', { name: 'Milk' })).not.toBeChecked()
    expect(screen.getByText('Milk')).not.toHaveClass('line-through')
  })

  it('names a blank list\'s area "Unnamed list tasks" and a blank task\'s box "Unnamed task"', async () => {
    server.use(...taskListsHandlers([{ id: 4, name: '' }]), ...tasksHandlers({ 4: [{ id: 1, text: '', done: false }] }))
    renderTasks()

    await screen.findByRole('list', { name: 'Unnamed list tasks' })
    expect(taskNames('Unnamed list')).toEqual(['Unnamed task'])
  })

  it("replaces the tasks with the clicked list's, and never shows the first list's while the second loads", async () => {
    const user = userEvent.setup()
    const choresGet = gate()
    server.use(
      http.get(`${API_BASE}/task_lists/9/tasks`, () => choresGet.wait()),
      ...both(),
    )
    renderTasks()
    await screen.findByText('Milk')

    await user.click(screen.getByRole('button', { name: 'Chores' }))

    expect(screen.getByText('Loading tasks...')).toBeInTheDocument()
    expect(screen.queryByText('Milk')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Shopping List tasks' })).not.toBeInTheDocument()

    choresGet.open()
    expect(await screen.findByText('Sweep')).toBeInTheDocument()
    expect(taskNames('Chores')).toEqual(['Sweep'])
    expect(screen.queryByText('Milk')).not.toBeInTheDocument()
  })

  it('fetches only the selected list, and sends no GET when going back to a list within the minute', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const gets = recordTaskGets()
    renderTasks()
    await screen.findByText('Milk')
    expect(gets).toEqual(['4'])

    await user.click(screen.getByRole('button', { name: 'Chores' }))
    await screen.findByText('Sweep')
    await user.click(screen.getByRole('button', { name: 'Shopping List' }))

    expect(screen.getByText('Milk')).toBeInTheDocument()
    expect(gets).toEqual(['4', '9'])
  })

  it('sends no GET for tasks, and shows no tasks area, when there are no lists', async () => {
    server.use(...taskListsHandlers([]), ...tasksHandlers())
    const gets = recordTaskGets()
    renderTasks()

    await screen.findByRole('list', { name: 'Task lists' })
    expect(screen.getAllByRole('list')).toHaveLength(1)
    expect(gets).toEqual([])
  })

  it('shows a loading message until the tasks arrive', async () => {
    server.use(...both())
    renderTasks()

    expect(await screen.findByText('Loading tasks...')).toHaveClass('text-muted-foreground')
    await screen.findByText('Milk')
    expect(screen.queryByText('Loading tasks...')).not.toBeInTheDocument()
  })

  it.each([
    ['a server error', () => new HttpResponse(null, { status: 500 })],
    ['a network error', () => HttpResponse.error()],
  ])('shows the load error after %s, and no tasks', async (_label, answer) => {
    server.use(http.get(`${API_BASE}/task_lists/:listId/tasks`, answer), ...both())
    renderTasks()

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load these tasks. Try reloading the page.")
    expect(screen.queryByRole('list', { name: 'Shopping List tasks' })).not.toBeInTheDocument()
  })

  it('shows no tasks area while the list editor is open', async () => {
    const user = userEvent.setup()
    server.use(...both())
    renderTasks()
    await screen.findByText('Milk')

    await user.click(screen.getByRole('button', { name: 'Edit lists' }))

    expect(screen.queryByRole('list', { name: 'Shopping List tasks' })).not.toBeInTheDocument()
  })
})

describe('the height of the tasks area', () => {
  it('is a fixed-height box that scrolls, holding the list', async () => {
    server.use(...both())
    renderTasks()

    const box = (await screen.findByRole('list', { name: 'Shopping List tasks' })).parentElement
    expect(box).toHaveClass('h-72', 'overflow-y-auto')
  })

  it('holds the loading message in the same box, so the card keeps its height while the tasks load', async () => {
    server.use(...both())
    renderTasks()

    expect((await screen.findByText('Loading tasks...')).parentElement).toHaveClass('h-72', 'overflow-y-auto')
  })

  it('wraps long text rather than widening the box', async () => {
    const text = 'x'.repeat(100)
    server.use(...taskListsHandlers(lists), ...tasksHandlers({ 4: [{ id: 1, text, done: false }] }))
    renderTasks()

    expect(await screen.findByText(text)).toHaveClass('break-words')
  })
})

describe('adding a task', () => {
  const plus = () => screen.queryByRole('button', { name: 'Add task' })
  const draft = () => screen.queryByRole('textbox', { name: 'New task' })
  const refused = (message: string) => () =>
    HttpResponse.json(errorBody('validation_failed', message), { status: 422 })

  async function openDraft(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Add task' }))
    return draft() as HTMLInputElement
  }

  it('shows the + as the last row of the list', async () => {
    server.use(...both())
    renderTasks()

    const button = await screen.findByRole('button', { name: 'Add task' })
    expect(area('Shopping List').lastElementChild).toContainElement(button)
  })

  it('shows only the + in a list with no tasks, and no message', async () => {
    server.use(...taskListsHandlers(lists), ...tasksHandlers({ 4: [] }))
    renderTasks()

    await screen.findByRole('button', { name: 'Add task' })
    expect(within(area('Shopping List')).getAllByRole('listitem')).toHaveLength(1)
    expect(area('Shopping List')).toHaveTextContent(/^$/)
  })

  it('shows no + with no lists, while the tasks load, or when they failed to load', async () => {
    const tasksGet = gate()
    server.use(
      http.get(`${API_BASE}/task_lists/9/tasks`, () => new HttpResponse(null, { status: 500 })),
      http.get(`${API_BASE}/task_lists/4/tasks`, () => tasksGet.wait()),
      ...both(),
    )
    const user = userEvent.setup()
    renderTasks()
    await screen.findByText('Loading tasks...')
    expect(plus()).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Chores' }))
    await screen.findByRole('alert')
    expect(plus()).not.toBeInTheDocument()
    tasksGet.open()
  })

  it('shows no + when there are no lists', async () => {
    server.use(...taskListsHandlers([]), ...tasksHandlers())
    renderTasks()

    await screen.findByRole('list', { name: 'Task lists' })
    expect(plus()).not.toBeInTheDocument()
  })

  it('turns the + row into a draft holding "New Task", focused and selected, with a disabled unchecked box', async () => {
    const user = userEvent.setup()
    server.use(...both())
    renderTasks()

    const input = await openDraft(user)

    expect(input).toHaveValue('New Task')
    expect(input).toHaveFocus()
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'New Task'.length])
    const row = area('Shopping List').lastElementChild as HTMLElement
    expect(row).toContainElement(input)
    const box = within(row).getByRole('checkbox', { hidden: true })
    expect(box).toBeDisabled()
    expect(box).not.toBeChecked()
    expect(plus()).not.toBeInTheDocument()
  })

  it('saves on Enter with one POST, even with the blur that follows; the task is last and focus is on the +', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const sent = recordRequests('post', '/task_lists/:listId/tasks')
    renderTasks()

    await openDraft(user)
    await user.keyboard('Bread{Enter}')

    expect(await screen.findByRole('checkbox', { name: 'Bread' })).not.toBeChecked()
    expect(taskNames('Shopping List')).toEqual(['Milk', 'Eggs', 'Bread'])
    expect(draft()).not.toBeInTheDocument()
    expect(plus()).toHaveFocus()
    expect(area('Shopping List').lastElementChild).toContainElement(plus())
    await user.click(screen.getByRole('heading', { name: 'Tasks' }))
    expect(sent).toEqual([{ path: '/api/v1/task_lists/4/tasks', body: { task: { text: 'Bread' } } }])
  })

  it('keeps the new task at the bottom after a reload', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const { unmount } = renderTasks()
    await openDraft(user)
    await user.keyboard('Bread{Enter}')
    await screen.findByText('Bread')

    unmount()
    queryClient.clear()
    renderTasks()

    await screen.findByText('Bread')
    expect(taskNames('Shopping List')).toEqual(['Milk', 'Eggs', 'Bread'])
    expect(area('Shopping List').lastElementChild).toContainElement(plus())
  })

  it('saves once when focus leaves, and leaves focus where it went', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const sent = recordRequests('post', '/task_lists/:listId/tasks')
    renderTasks()

    await openDraft(user)
    await user.keyboard('Bread')
    await user.click(screen.getByRole('heading', { name: 'Tasks' }))

    expect(await screen.findByText('Bread')).toBeInTheDocument()
    expect(sent).toHaveLength(1)
    expect(plus()).not.toHaveFocus()
  })

  it('saves a blank task when the draft is emptied and focus leaves', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const sent = recordRequests('post', '/task_lists/:listId/tasks')
    renderTasks()

    await openDraft(user)
    await user.keyboard('{Backspace}')
    await user.click(screen.getByRole('heading', { name: 'Tasks' }))

    expect(await screen.findByRole('checkbox', { name: 'Unnamed task' })).toBeInTheDocument()
    expect(sent).toEqual([{ path: '/api/v1/task_lists/4/tasks', body: { task: { text: '' } } }])
  })

  it('cancels with Escape: sends nothing, and the + comes back with focus', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const sent = recordRequests('post', '/task_lists/:listId/tasks')
    renderTasks()

    await openDraft(user)
    await user.keyboard('Bread{Escape}')

    expect(draft()).not.toBeInTheDocument()
    expect(plus()).toHaveFocus()
    expect(taskNames('Shopping List')).toEqual(['Milk', 'Eggs'])
    expect(sent).toEqual([])
  })

  it("shows the API's message for a 422, keeps the text, and does not resend on blur until edited", async () => {
    const user = userEvent.setup()
    server.use(...both())
    const sent = recordRequests(
      'post',
      '/task_lists/:listId/tasks',
      refused('Text is too long (maximum is 100 characters).'),
    )
    renderTasks()

    await openDraft(user)
    await user.keyboard('Bread{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Text is too long (maximum is 100 characters).')
    expect(draft()).toHaveValue('Bread')
    await user.click(screen.getByRole('heading', { name: 'Tasks' }))
    expect(sent).toHaveLength(1)

    await user.click(draft()!)
    await user.keyboard('s')
    await user.click(screen.getByRole('heading', { name: 'Tasks' }))
    await waitFor(() => expect(sent).toHaveLength(2))
  })

  it('shows the generic line after a failure, and clears it when the next save starts', async () => {
    const user = userEvent.setup()
    let posts = 0
    server.use(
      http.post(`${API_BASE}/task_lists/:listId/tasks`, () => {
        posts += 1
        if (posts === 1) return new HttpResponse(null, { status: 500 })
      }),
      ...both(),
    )
    renderTasks()

    await openDraft(user)
    await user.keyboard('Bread{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't add the task. Try again.")
    expect(draft()).toHaveValue('Bread')

    await user.keyboard('{Enter}')
    expect(await screen.findByText('Bread')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('refreshes the lists and tasks quietly when the list was deleted elsewhere (404)', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const listGets = recordTaskGets()
    let listsGets = 0
    server.use(
      http.get(`${API_BASE}/task_lists`, () => {
        listsGets += 1
      }),
      http.post(`${API_BASE}/task_lists/:listId/tasks`, () =>
        HttpResponse.json(errorBody('not_found', 'Not found.'), { status: 404 }),
      ),
    )
    renderTasks()

    await openDraft(user)
    await user.keyboard('Bread{Enter}')

    await waitFor(() => expect(listsGets).toBe(2))
    await waitFor(() => expect(listGets).toEqual(['4', '4']))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('saves an open draft to its own list when another list is clicked, and not to the new one', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const sent = recordRequests('post', '/task_lists/:listId/tasks')
    renderTasks()

    await openDraft(user)
    await user.keyboard('Bread')
    await user.click(screen.getByRole('button', { name: 'Chores' }))

    await screen.findByText('Sweep')
    await waitFor(() => expect(sent).toEqual([{ path: '/api/v1/task_lists/4/tasks', body: { task: { text: 'Bread' } } }]))
    expect(taskNames('Chores')).toEqual(['Sweep'])
    expect(draft()).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Shopping List' }))
    expect(await screen.findByText('Bread')).toBeInTheDocument()
    expect(taskNames('Shopping List')).toEqual(['Milk', 'Eggs', 'Bread'])
  })
})

describe("editing a task's text", () => {
  const textBox = () => screen.queryByRole('textbox', { name: 'Task text' }) as HTMLInputElement | null
  const refused = (message: string) => () =>
    HttpResponse.json(errorBody('validation_failed', message), { status: 422 })

  it('opens a box labelled "Task text" holding the text, focused, in place of the text', async () => {
    const user = userEvent.setup()
    server.use(...both())
    renderTasks()

    await user.click(await screen.findByRole('button', { name: 'Edit Milk' }))

    expect(textBox()).toHaveValue('Milk')
    expect(textBox()).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Edit Milk' })).not.toBeInTheDocument()
    expect(area('Shopping List').firstElementChild).toContainElement(textBox())
  })

  it('opens with the keyboard', async () => {
    const user = userEvent.setup()
    server.use(...both())
    renderTasks()

    ;(await screen.findByRole('button', { name: 'Edit Milk' })).focus()
    await user.keyboard('{Enter}')

    expect(textBox()).toHaveFocus()
  })

  it('sends PATCH with only the text on Enter, shows the new text, and returns focus to it', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const sent = recordRequests('patch', '/task_lists/:listId/tasks/:id')
    renderTasks()

    await user.click(await screen.findByRole('button', { name: 'Edit Milk' }))
    await user.keyboard('{Control>}a{/Control}Oat milk{Enter}')

    expect(await screen.findByRole('button', { name: 'Edit Oat milk' })).toHaveFocus()
    expect(textBox()).not.toBeInTheDocument()
    expect(taskNames('Shopping List')).toEqual(['Oat milk', 'Eggs'])
    expect(sent).toEqual([{ path: '/api/v1/task_lists/4/tasks/1', body: { task: { text: 'Oat milk' } } }])
  })

  it('saves when focus leaves, and the new text stays after a reload', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const sent = recordRequests('patch', '/task_lists/:listId/tasks/:id')
    const { unmount } = renderTasks()

    await user.click(await screen.findByRole('button', { name: 'Edit Milk' }))
    await user.keyboard('{Control>}a{/Control}Oat milk')
    await user.click(screen.getByRole('heading', { name: 'Tasks' }))
    await screen.findByRole('button', { name: 'Edit Oat milk' })
    expect(sent).toHaveLength(1)

    unmount()
    queryClient.clear()
    renderTasks()
    expect(await screen.findByRole('button', { name: 'Edit Oat milk' })).toBeInTheDocument()
  })

  it('sends nothing when the text has not changed, or changed only by surrounding spaces', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const sent = recordRequests('patch', '/task_lists/:listId/tasks/:id')
    renderTasks()

    await user.click(await screen.findByRole('button', { name: 'Edit Milk' }))
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('button', { name: 'Edit Milk' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Edit Milk' }))
    await user.keyboard('{Control>}a{/Control} Milk {Enter}')
    expect(await screen.findByRole('button', { name: 'Edit Milk' })).toBeInTheDocument()
    expect(sent).toEqual([])
  })

  it('puts the saved text back on Escape and sends nothing', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const sent = recordRequests('patch', '/task_lists/:listId/tasks/:id')
    renderTasks()

    await user.click(await screen.findByRole('button', { name: 'Edit Milk' }))
    await user.keyboard('{Control>}a{/Control}Oat milk{Escape}')

    expect(screen.getByRole('button', { name: 'Edit Milk' })).toHaveFocus()
    expect(textBox()).not.toBeInTheDocument()
    expect(sent).toEqual([])
  })

  it('allows blank text: the box reads "Unnamed task" and the text button "Edit task", still clickable', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const sent = recordRequests('patch', '/task_lists/:listId/tasks/:id')
    renderTasks()

    await user.click(await screen.findByRole('button', { name: 'Edit Milk' }))
    await user.keyboard('{Control>}a{/Control}{Backspace}{Enter}')

    const edit = await screen.findByRole('button', { name: 'Edit task' })
    expect(edit).toHaveClass('min-w-16')
    expect(screen.getByRole('checkbox', { name: 'Unnamed task' })).toBeInTheDocument()
    expect(sent).toEqual([{ path: '/api/v1/task_lists/4/tasks/1', body: { task: { text: '' } } }])

    await user.click(edit)
    expect(textBox()).toHaveValue('')
  })

  it("shows the API's message for a 422, keeps the text, and does not resend on blur until edited", async () => {
    const user = userEvent.setup()
    server.use(...both())
    const sent = recordRequests(
      'patch',
      '/task_lists/:listId/tasks/:id',
      refused('Text is too long (maximum is 100 characters).'),
    )
    renderTasks()

    await user.click(await screen.findByRole('button', { name: 'Edit Milk' }))
    await user.keyboard('{Control>}a{/Control}Oat milk{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Text is too long (maximum is 100 characters).')
    expect(textBox()).toHaveValue('Oat milk')
    await user.click(screen.getByRole('heading', { name: 'Tasks' }))
    expect(sent).toHaveLength(1)
    expect(textBox()).toHaveValue('Oat milk')
  })

  it('shows the generic line after a failure, keeping the text', async () => {
    const user = userEvent.setup()
    server.use(
      http.patch(`${API_BASE}/task_lists/:listId/tasks/:id`, () => new HttpResponse(null, { status: 500 })),
      ...both(),
    )
    renderTasks()

    await user.click(await screen.findByRole('button', { name: 'Edit Milk' }))
    await user.keyboard('{Control>}a{/Control}Oat milk{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save the task. Try again.")
    expect(textBox()).toHaveValue('Oat milk')
  })

  it('refreshes the lists and tasks quietly when the task or list was deleted elsewhere (404)', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const listGets = recordTaskGets()
    let listsGets = 0
    server.use(
      http.get(`${API_BASE}/task_lists`, () => {
        listsGets += 1
      }),
      http.patch(`${API_BASE}/task_lists/:listId/tasks/:id`, () =>
        HttpResponse.json(errorBody('not_found', 'Not found.'), { status: 404 }),
      ),
    )
    renderTasks()

    await user.click(await screen.findByRole('button', { name: 'Edit Milk' }))
    await user.keyboard('{Control>}a{/Control}Oat milk{Enter}')

    await waitFor(() => expect(listsGets).toBe(2))
    await waitFor(() => expect(listGets).toEqual(['4', '4']))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('saves an open edit to its own list when another list is clicked', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const sent = recordRequests('patch', '/task_lists/:listId/tasks/:id')
    renderTasks()

    await user.click(await screen.findByRole('button', { name: 'Edit Milk' }))
    await user.keyboard('{Control>}a{/Control}Oat milk')
    await user.click(screen.getByRole('button', { name: 'Chores' }))
    await screen.findByText('Sweep')
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].path).toBe('/api/v1/task_lists/4/tasks/1')

    await user.click(screen.getByRole('button', { name: 'Shopping List' }))
    expect(await screen.findByRole('button', { name: 'Edit Oat milk' })).toBeInTheDocument()
  })
})

describe('checking and unchecking a task', () => {
  const box = (name: string) => screen.getByRole('checkbox', { name })

  it('checks a task with PATCH sending only done, strikes it through at once, and keeps its place', async () => {
    const user = userEvent.setup()
    const patch = gate()
    server.use(...both())
    const sent = recordRequests('patch', '/task_lists/:listId/tasks/:id')
    server.use(http.patch(`${API_BASE}/task_lists/:listId/tasks/:id`, () => patch.wait()))
    renderTasks()

    await user.click(await screen.findByRole('checkbox', { name: 'Milk' }))

    // Before the server has answered.
    expect(box('Milk')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Edit Milk' })).toHaveClass('line-through')
    expect(taskNames('Shopping List')).toEqual(['Milk', 'Eggs'])
    patch.open()
    await waitFor(() => expect(sent).toEqual([{ path: '/api/v1/task_lists/4/tasks/1', body: { task: { done: true } } }]))
    expect(box('Milk')).toBeChecked()
  })

  it('is still checked and struck through after a reload', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const sent = recordRequests('patch', '/task_lists/:listId/tasks/:id')
    const { unmount } = renderTasks()

    await user.click(await screen.findByRole('checkbox', { name: 'Milk' }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))

    unmount()
    queryClient.clear()
    renderTasks()
    expect(await screen.findByRole('checkbox', { name: 'Milk' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Edit Milk' })).toHaveClass('line-through')
    expect(taskNames('Shopping List')).toEqual(['Milk', 'Eggs'])
  })

  it('unchecks a task with PATCH sending only done: false, removes the strikethrough, and stays so after a reload', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const sent = recordRequests('patch', '/task_lists/:listId/tasks/:id')
    const { unmount } = renderTasks()

    await user.click(await screen.findByRole('checkbox', { name: 'Eggs' }))

    expect(box('Eggs')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Edit Eggs' })).not.toHaveClass('line-through')
    await waitFor(() => expect(sent).toEqual([{ path: '/api/v1/task_lists/4/tasks/3', body: { task: { done: false } } }]))
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))

    unmount()
    queryClient.clear()
    renderTasks()
    expect(await screen.findByRole('checkbox', { name: 'Eggs' })).not.toBeChecked()
  })

  it('checks with the keyboard', async () => {
    const user = userEvent.setup()
    server.use(...both())
    renderTasks()

    ;(await screen.findByRole('checkbox', { name: 'Milk' })).focus()
    await user.keyboard(' ')

    expect(box('Milk')).toBeChecked()
  })

  it.each([
    ['Milk', "Couldn't save 'Milk'. Try again."],
    ['', "Couldn't save this task. Try again."],
  ])('puts the box back after a failure and names task %j on the line', async (text, message) => {
    const user = userEvent.setup()
    server.use(
      http.patch(`${API_BASE}/task_lists/:listId/tasks/:id`, () => new HttpResponse(null, { status: 500 })),
      ...taskListsHandlers(lists),
      ...tasksHandlers({ 4: [{ id: 1, text, done: false }] }),
    )
    const gets = recordTaskGets()
    renderTasks()

    const checkbox = await screen.findByRole('checkbox', { name: text || 'Unnamed task' })
    await user.click(checkbox)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(checkbox).not.toBeChecked()
    // Once it has settled the tasks are fetched again, once, to show what the server has.
    await waitFor(() => expect(gets).toEqual(['4', '4']))
  })

  it('clears the error line when the next save starts', async () => {
    const user = userEvent.setup()
    let patches = 0
    server.use(
      http.patch(`${API_BASE}/task_lists/:listId/tasks/:id`, () => {
        patches += 1
        if (patches === 1) return new HttpResponse(null, { status: 500 })
      }),
      ...both(),
    )
    renderTasks()

    await user.click(await screen.findByRole('checkbox', { name: 'Milk' }))
    await screen.findByRole('alert')
    await user.click(box('Eggs'))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('sends quick clicks on one box to the server one at a time, in the order they were made', async () => {
    const user = userEvent.setup()
    const first = gate()
    const bodies: unknown[] = []
    server.use(...both())
    server.use(
      http.patch(`${API_BASE}/task_lists/:listId/tasks/:id`, async ({ request }) => {
        bodies.push(await request.clone().json())
        if (bodies.length === 1) await first.wait()
        return undefined
      }),
    )
    renderTasks()

    const milk = await screen.findByRole('checkbox', { name: 'Milk' })
    await user.click(milk)
    await user.click(milk)
    await user.click(milk)

    expect(milk).toBeChecked()
    expect(bodies).toHaveLength(1) // the others wait for the first to settle
    first.open()
    await waitFor(() => expect(bodies).toHaveLength(3))
    expect(bodies).toEqual([{ task: { done: true } }, { task: { done: false } }, { task: { done: true } }])
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    expect(milk).toBeChecked()
  })

  it('stays checked when an edit sent before the check answers after it', async () => {
    const user = userEvent.setup()
    const textAnswer = gate()
    server.use(...both())
    server.use(
      http.patch(`${API_BASE}/task_lists/:listId/tasks/:id`, async ({ request }) => {
        const body = (await request.clone().json()) as { task: { text?: string } }
        if (body.task.text === undefined) return undefined
        // The edit's answer was read before the check landed, so it still says unchecked.
        await textAnswer.wait()
        return HttpResponse.json({ task: { id: 1, text: 'Oat milk', done: false } })
      }),
    )
    renderTasks()

    await user.click(await screen.findByRole('button', { name: 'Edit Milk' }))
    await user.keyboard('{Control>}a{/Control}Oat milk')
    // Clicking the box blurs the text box, which sends the edit, and then checks the task.
    await user.click(box('Milk'))
    await waitFor(() => expect(queryClient.isMutating()).toBe(1))
    textAnswer.open()

    expect(await screen.findByRole('button', { name: 'Edit Oat milk' })).toBeInTheDocument()
    expect(box('Oat milk')).toBeChecked()
  })

  it('keeps a check made while the tasks were being fetched again', async () => {
    const user = userEvent.setup()
    const refetch = gate()
    let gets = 0
    server.use(...both())
    server.use(
      http.get(`${API_BASE}/task_lists/:listId/tasks`, async () => {
        gets += 1
        if (gets === 1) return undefined
        // An older answer, from before the check.
        await refetch.wait()
        return HttpResponse.json({ tasks: shoppingTasks })
      }),
    )
    renderTasks()
    await screen.findByRole('checkbox', { name: 'Milk' })
    void queryClient.invalidateQueries({ queryKey: ['tasks', 4] })
    await waitFor(() => expect(gets).toBe(2))

    await user.click(box('Milk'))
    refetch.open()

    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    expect(box('Milk')).toBeChecked()
  })

  it('refreshes the lists and tasks quietly when the task or list was deleted elsewhere (404)', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const listGets = recordTaskGets()
    let listsGets = 0
    server.use(
      http.get(`${API_BASE}/task_lists`, () => {
        listsGets += 1
      }),
      http.patch(`${API_BASE}/task_lists/:listId/tasks/:id`, () =>
        HttpResponse.json(errorBody('not_found', 'Not found.'), { status: 404 }),
      ),
    )
    renderTasks()

    await user.click(await screen.findByRole('checkbox', { name: 'Milk' }))

    await waitFor(() => expect(listsGets).toBe(2))
    await waitFor(() => expect(listGets).toEqual(['4', '4']))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
