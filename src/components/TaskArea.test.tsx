// The tasks area of the Tasks card. The whole card is rendered, since the row chooses the list, with the real
// queryClient and a mock token; the API is the in-memory taskListsHandlers and tasksHandlers unless a test answers a
// request itself.
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, errorBody, REFRESH_TOKEN, taskListsHandlers, tasksHandlers, type MockTask } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { Tasks } from './Tasks'

function renderTasks() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Tasks />
      </MemoryRouter>
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

// Records the path of every DELETE of a task and passes it on, or answers it with `answer` when given. Register it
// after the handlers that answer, as for recordTaskGets.
function recordTaskDeletes(answer?: () => Response | Promise<Response>) {
  const paths: string[] = []
  server.use(
    http.delete(`${API_BASE}/task_lists/:listId/tasks/:id`, ({ request }) => {
      paths.push(new URL(request.url).pathname)
      return answer?.()
    }),
  )
  return paths
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

  it('cuts long text to one line with an ellipsis rather than widening the box, with the full text as its title', async () => {
    const text = 'x'.repeat(100)
    server.use(...taskListsHandlers(lists), ...tasksHandlers({ 4: [{ id: 1, text, done: false }] }))
    renderTasks()

    const button = await screen.findByRole('button', { name: `Edit ${text}` })
    expect(button).toHaveClass('truncate', 'min-w-0', 'flex-1')
    expect(button).not.toHaveClass('break-words')
    expect(button).toHaveAttribute('title', text)
  })

  it('opens the edit box with the full text of a cut task', async () => {
    const user = userEvent.setup()
    const text = 'x'.repeat(100)
    server.use(...taskListsHandlers(lists), ...tasksHandlers({ 4: [{ id: 1, text, done: false }] }))
    renderTasks()

    await user.click(await screen.findByRole('button', { name: `Edit ${text}` }))
    expect(screen.getByRole('textbox', { name: 'Task text' })).toHaveValue(text)
  })

  it('gives a blank task no title', async () => {
    server.use(...taskListsHandlers(lists), ...tasksHandlers({ 4: [{ id: 1, text: '', done: false }] }))
    renderTasks()

    expect(await screen.findByRole('button', { name: 'Edit task' })).not.toHaveAttribute('title')
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
    expect(edit).toHaveClass('flex-1')
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

describe('deleting a task', () => {
  const deleteButton = (name: string) => screen.getByRole('button', { name })
  const dialog = (title: string) => screen.findByRole('alertdialog', { name: title })
  const plus = () => screen.getByRole('button', { name: 'Add task' })

  async function askToDelete(user: ReturnType<typeof userEvent.setup>, name = 'Delete Milk', title = "Delete 'Milk'?") {
    await user.click(await screen.findByRole('button', { name }))
    return dialog(title)
  }

  it('gives each row a delete button named for its task, last in the row', async () => {
    server.use(...both())
    renderTasks()

    const button = await screen.findByRole('button', { name: 'Delete Milk' })
    expect(button.closest('li')?.lastElementChild).toBe(button)
    expect(deleteButton('Delete Eggs')).toBeInTheDocument()
  })

  it('names a blank task\'s button "Delete task"', async () => {
    server.use(...taskListsHandlers(lists), ...tasksHandlers({ 4: [{ id: 1, text: '', done: false }] }))
    renderTasks()

    expect(await screen.findByRole('button', { name: 'Delete task' })).toBeInTheDocument()
  })

  it('hides the button only where the device can hover, until the row is hovered or focused', async () => {
    server.use(...both())
    renderTasks()

    const button = await screen.findByRole('button', { name: 'Delete Milk' })
    expect(button).toHaveClass(
      'can-hover:opacity-0',
      'group-hover:opacity-100',
      'group-focus-within:opacity-100',
      'focus-visible:opacity-100',
    )
    expect(button.closest('li')).toHaveClass('group')
  })

  it('is reached with Tab from the task text, after its calendar button', async () => {
    const user = userEvent.setup()
    server.use(...both())
    renderTasks()

    ;(await screen.findByRole('button', { name: 'Edit Milk' })).focus()
    await user.tab()
    await user.tab()

    expect(deleteButton('Delete Milk')).toHaveFocus()
  })

  it('asks first, in a dialog titled with the task, and opens with the keyboard', async () => {
    const user = userEvent.setup()
    server.use(...both())
    renderTasks()

    ;(await screen.findByRole('button', { name: 'Delete Milk' })).focus()
    await user.keyboard('{Enter}')

    const confirm = await dialog("Delete 'Milk'?")
    expect(within(confirm).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('titles the dialog "Delete this task?" for a blank task, with no empty quotes', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(lists), ...tasksHandlers({ 4: [{ id: 1, text: '', done: false }] }))
    renderTasks()

    expect(await askToDelete(user, 'Delete task', 'Delete this task?')).toBeInTheDocument()
  })

  it('sends nothing on Cancel, keeps the task, and returns focus to the delete button', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const deletes = recordTaskDeletes()
    renderTasks()

    const confirm = await askToDelete(user)
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(deleteButton('Delete Milk')).toHaveFocus()
    expect(taskNames('Shopping List')).toEqual(['Milk', 'Eggs'])
    expect(deletes).toEqual([])
  })

  it('sends one DELETE on confirm, removes the task without fetching again, and puts focus on the +', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const gets = recordTaskGets()
    const deletes = recordTaskDeletes()
    renderTasks()

    const confirm = await askToDelete(user)
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(taskNames('Shopping List')).toEqual(['Eggs']))
    await waitFor(() => expect(plus()).toHaveFocus())
    expect(deletes).toEqual(['/api/v1/task_lists/4/tasks/1'])
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    expect(gets).toEqual(['4'])
  })

  it('keeps the task gone after a reload', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const { unmount } = renderTasks()

    const confirm = await askToDelete(user)
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(taskNames('Shopping List')).toEqual(['Eggs']))

    unmount()
    queryClient.clear()
    renderTasks()
    await screen.findByText('Eggs')
    expect(taskNames('Shopping List')).toEqual(['Eggs'])
  })

  it('counts a 404 (already deleted elsewhere) as deleted, and fetches the lists and tasks again quietly', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const gets = recordTaskGets()
    let listsGets = 0
    server.use(
      http.get(`${API_BASE}/task_lists`, () => {
        listsGets += 1
      }),
    )
    recordTaskDeletes(() => HttpResponse.json(errorBody('not_found', 'Not found.'), { status: 404 }))
    renderTasks()

    const confirm = await askToDelete(user)
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(listsGets).toBe(2))
    await waitFor(() => expect(gets).toEqual(['4', '4']))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    ['Milk', 'Delete Milk', "Delete 'Milk'?", "Couldn't delete 'Milk'. Try again."],
    ['', 'Delete task', 'Delete this task?', "Couldn't delete this task. Try again."],
  ])('keeps task %j after a failure, says so on the line, and enables its button again', async (text, name, title, message) => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(lists), ...tasksHandlers({ 4: [{ id: 1, text, done: false }] }))
    recordTaskDeletes(() => new HttpResponse(null, { status: 500 }))
    renderTasks()

    const confirm = await askToDelete(user, name, title)
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(taskNames('Shopping List')).toEqual([text || 'Unnamed task'])
    await waitFor(() => expect(deleteButton(name)).toBeEnabled())
  })

  it('disables the button while its DELETE is in flight', async () => {
    const user = userEvent.setup()
    const answer = gate()
    server.use(...both())
    recordTaskDeletes(async () => {
      await answer.wait()
      return new HttpResponse(null, { status: 204 })
    })
    renderTasks()

    const confirm = await askToDelete(user)
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteButton('Delete Milk')).toBeDisabled())
    expect(deleteButton('Delete Eggs')).toBeEnabled()
    answer.open()
    await waitFor(() => expect(taskNames('Shopping List')).toEqual(['Eggs']))
  })

  it('does not bring the task back when a check sent before the delete answers after it', async () => {
    const user = userEvent.setup()
    const checkAnswer = gate()
    server.use(...both())
    server.use(
      http.patch(`${API_BASE}/task_lists/:listId/tasks/:id`, async () => {
        await checkAnswer.wait()
        return HttpResponse.json({ task: { id: 1, text: 'Milk', done: true } })
      }),
    )
    renderTasks()

    await user.click(await screen.findByRole('checkbox', { name: 'Milk' }))
    const confirm = await askToDelete(user)
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(taskNames('Shopping List')).toEqual(['Eggs']))
    checkAnswer.open()

    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    expect(taskNames('Shopping List')).toEqual(['Eggs'])
  })

  it('does not bring the task back when an edit sent before the delete answers after it', async () => {
    const user = userEvent.setup()
    const editAnswer = gate()
    server.use(...both())
    server.use(
      http.patch(`${API_BASE}/task_lists/:listId/tasks/:id`, async () => {
        await editAnswer.wait()
        return HttpResponse.json({ task: { id: 1, text: 'Oat milk', done: false } })
      }),
    )
    renderTasks()

    await user.click(await screen.findByRole('button', { name: 'Edit Milk' }))
    await user.keyboard('{Control>}a{/Control}Oat milk')
    // Clicking the delete button blurs the text box, which sends the edit first.
    const confirm = await askToDelete(user)
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(within(area('Shopping List')).queryAllByRole('checkbox')).toHaveLength(1))
    editAnswer.open()

    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    expect(taskNames('Shopping List')).toEqual(['Eggs'])
  })
})

describe('deleting all done tasks', () => {
  const broom = () => screen.getByRole('button', { name: 'Delete all done tasks' })
  const plus = () => screen.getByRole('button', { name: 'Add task' })
  const dialog = () => screen.findByRole('alertdialog', { name: 'Delete all done tasks?' })

  // Records the path of every DELETE of a list's done tasks and passes it on, or answers it with `answer` when given.
  function recordClears(answer?: () => Response | Promise<Response>) {
    const paths: string[] = []
    server.use(
      http.delete(`${API_BASE}/task_lists/:listId/done_tasks`, ({ request }) => {
        paths.push(new URL(request.url).pathname)
        return answer?.()
      }),
    )
    return paths
  }

  async function askToClear(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Delete all done tasks' }))
    return dialog()
  }

  it('labels the broom, and puts it in the + row at the right edge', async () => {
    server.use(...both())
    renderTasks()
    const button = await screen.findByRole('button', { name: 'Delete all done tasks' })
    expect(button.parentElement).toBe(plus().parentElement)
    expect(button.parentElement).toHaveClass('flex', 'items-center')
    expect(button).toHaveClass('ml-auto')
  })

  it('is disabled with nothing done and enabled once a task is checked', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(lists), ...tasksHandlers({ 4: [{ id: 1, text: 'Milk', done: false }] }))
    renderTasks()
    expect(await screen.findByRole('button', { name: 'Delete all done tasks' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Milk' }))
    await waitFor(() => expect(broom()).toBeEnabled())
  })

  it('opens "Delete all done tasks?" when tapped', async () => {
    const user = userEvent.setup()
    server.use(...both())
    renderTasks()
    const confirm = await askToClear(user)
    expect(within(confirm).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('hides the broom while a task is being drafted and brings it back when the draft closes', async () => {
    const user = userEvent.setup()
    server.use(...both())
    renderTasks()
    await user.click(await screen.findByRole('button', { name: 'Add task' }))
    expect(screen.queryByRole('button', { name: 'Delete all done tasks' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(await screen.findByRole('button', { name: 'Delete all done tasks' })).toBeInTheDocument()
  })

  it('sends one DELETE on confirm, removes the done tasks without fetching again, and puts focus on the +', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const gets = recordTaskGets()
    const clears = recordClears()
    renderTasks()

    const confirm = await askToClear(user)
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(taskNames('Shopping List')).toEqual(['Milk']))
    await waitFor(() => expect(plus()).toHaveFocus())
    expect(clears).toEqual(['/api/v1/task_lists/4/done_tasks'])
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    expect(gets).toEqual(['4'])
    expect(broom()).toBeDisabled()
  })

  it('disables the broom while the DELETE is in flight', async () => {
    const user = userEvent.setup()
    const answer = gate()
    server.use(...both())
    recordClears(async () => {
      await answer.wait()
      return new HttpResponse(null, { status: 204 })
    })
    renderTasks()

    const confirm = await askToClear(user)
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(broom()).toBeDisabled())
    expect(taskNames('Shopping List')).toEqual(['Milk', 'Eggs'])
    answer.open()
    await waitFor(() => expect(taskNames('Shopping List')).toEqual(['Milk']))
  })

  it('sends nothing on Cancel, keeps the tasks, and returns focus to the broom', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const clears = recordClears()
    renderTasks()

    const confirm = await askToClear(user)
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(broom()).toHaveFocus()
    expect(clears).toEqual([])
    expect(taskNames('Shopping List')).toEqual(['Milk', 'Eggs'])
  })

  it('counts a 404 (list deleted elsewhere) as cleared, and fetches the lists and tasks again quietly', async () => {
    const user = userEvent.setup()
    server.use(...both())
    const gets = recordTaskGets()
    let listsGets = 0
    server.use(
      http.get(`${API_BASE}/task_lists`, () => {
        listsGets += 1
      }),
    )
    recordClears(() => HttpResponse.json(errorBody('not_found', 'Not found.'), { status: 404 }))
    renderTasks()

    const confirm = await askToClear(user)
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(listsGets).toBe(2))
    await waitFor(() => expect(gets).toEqual(['4', '4']))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the tasks after a failure and says so on the line', async () => {
    const user = userEvent.setup()
    server.use(...both())
    recordClears(() => new HttpResponse(null, { status: 500 }))
    renderTasks()

    const confirm = await askToClear(user)
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't clear the done tasks. Try again.")
    expect(taskNames('Shopping List')).toEqual(['Milk', 'Eggs'])
    await waitFor(() => expect(broom()).toBeEnabled())
  })
})

describe("a task's due date", () => {
  // The current year is read from the clock, so it is pinned: 1 November 2026, a Sunday, at noon in Los Angeles.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 1, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const dated = (tasks: MockTask[]) => [...taskListsHandlers(lists), ...tasksHandlers({ 4: tasks })]
  const rowOf = (name: string) => screen.getByRole('checkbox', { name }).closest('li') as HTMLElement
  // The date's text is split between a screen-reader-only "Due " and the visible date, so it is found by the whole
  // text a screen reader reads.
  const byWholeText = (text: string) => (_content: string, element: Element | null) =>
    element?.tagName === 'SPAN' && element.textContent === text

  it('shows a date in the current year as "Nov 5", muted, and named "Due Nov 5"', async () => {
    server.use(...dated([{ id: 1, text: 'Milk', done: false, due_on: '2026-11-05' }]))
    renderTasks()

    const date = await screen.findByText(byWholeText('Due Nov 5'))
    expect(date).toHaveClass('text-muted-foreground')
    expect(date.querySelector('time')).toHaveAttribute('dateTime', '2026-11-05')
    expect(within(date).getByText('Due')).toHaveClass('sr-only')
  })

  it('adds the year to a date outside the current year', async () => {
    server.use(
      ...dated([
        { id: 1, text: 'Milk', done: false, due_on: '2027-11-05' },
        { id: 2, text: 'Eggs', done: false, due_on: '2025-12-31' },
      ]),
    )
    renderTasks()

    expect(await screen.findByText(byWholeText('Due Nov 5, 2027'))).toBeInTheDocument()
    expect(screen.getByText(byWholeText('Overdue, due Dec 31, 2025'))).toBeInTheDocument()
  })

  describe('overdue', () => {
    const dateOf = (text: string) => screen.findByText(byWholeText(text))

    it('shows a past date on an unchecked task in red and says it is overdue', async () => {
      server.use(...dated([{ id: 1, text: 'Milk', done: false, due_on: '2026-10-31' }]))
      renderTasks()

      const date = await dateOf('Overdue, due Oct 31')
      expect(date).toHaveClass('text-destructive')
      expect(date).not.toHaveClass('text-muted-foreground')
      expect(date.querySelector('time')).toHaveAttribute('dateTime', '2026-10-31')
    })

    it('does not mark a date today', async () => {
      server.use(...dated([{ id: 1, text: 'Milk', done: false, due_on: '2026-11-01' }]))
      renderTasks()

      const date = await dateOf('Due Nov 1')
      expect(date).toHaveClass('text-muted-foreground')
      expect(date).not.toHaveClass('text-destructive')
    })

    it('does not mark a future date', async () => {
      server.use(...dated([{ id: 1, text: 'Milk', done: false, due_on: '2026-11-02' }]))
      renderTasks()

      expect(await dateOf('Due Nov 2')).not.toHaveClass('text-destructive')
    })

    it('does not mark a past date on a checked task', async () => {
      server.use(...dated([{ id: 1, text: 'Milk', done: true, due_on: '2026-10-31' }]))
      renderTasks()

      const date = await dateOf('Due Oct 31')
      expect(date).toHaveClass('text-muted-foreground')
      expect(date).not.toHaveClass('text-destructive')
    })

    it('drops the red when the task is checked and restores it when unchecked', async () => {
      server.use(...dated([{ id: 1, text: 'Milk', done: false, due_on: '2026-10-31' }]))
      renderTasks()
      const user = userEvent.setup()

      expect(await dateOf('Overdue, due Oct 31')).toHaveClass('text-destructive')
      await user.click(screen.getByRole('checkbox', { name: 'Milk' }))
      expect(await dateOf('Due Oct 31')).toHaveClass('text-muted-foreground')
      await user.click(screen.getByRole('checkbox', { name: 'Milk' }))
      expect(await dateOf('Overdue, due Oct 31')).toHaveClass('text-destructive')
    })

    it('shows nothing for a task with no date', async () => {
      server.use(...dated([{ id: 1, text: 'Milk', done: false }]))
      renderTasks()

      await screen.findByRole('checkbox', { name: 'Milk' })
      expect(rowOf('Milk').querySelector('time')).toBeNull()
      expect(screen.queryByText(/overdue/i)).toBeNull()
    })
  })

  describe('strike-through', () => {
    const dateOf = (text: string) => screen.findByText(byWholeText(text))

    it('strikes through the date of a done task, as the text is', async () => {
      server.use(...dated([{ id: 1, text: 'Milk', done: true, due_on: '2026-11-05' }]))
      renderTasks()

      expect(await dateOf('Due Nov 5')).toHaveClass('line-through')
      expect(screen.getByRole('button', { name: 'Edit Milk' })).toHaveClass('line-through')
    })

    it('does not strike through the date of an unchecked task', async () => {
      server.use(...dated([{ id: 1, text: 'Milk', done: false, due_on: '2026-11-05' }]))
      renderTasks()

      expect(await dateOf('Due Nov 5')).not.toHaveClass('line-through')
    })

    it('adds the strike-through when the task is checked and removes it when unchecked', async () => {
      server.use(...dated([{ id: 1, text: 'Milk', done: false, due_on: '2026-11-05' }]))
      renderTasks()
      const user = userEvent.setup()

      expect(await dateOf('Due Nov 5')).not.toHaveClass('line-through')
      await user.click(screen.getByRole('checkbox', { name: 'Milk' }))
      expect(await dateOf('Due Nov 5')).toHaveClass('line-through')
      await user.click(screen.getByRole('checkbox', { name: 'Milk' }))
      expect(await dateOf('Due Nov 5')).not.toHaveClass('line-through')
    })

    it('strikes through a done task with a past date, muted and not red', async () => {
      server.use(...dated([{ id: 1, text: 'Milk', done: true, due_on: '2026-10-31' }]))
      renderTasks()

      const date = await dateOf('Due Oct 31')
      expect(date).toHaveClass('line-through', 'text-muted-foreground')
      expect(date).not.toHaveClass('text-destructive')
    })

    it('keeps an overdue unchecked date red and not struck through', async () => {
      server.use(...dated([{ id: 1, text: 'Milk', done: false, due_on: '2026-10-31' }]))
      renderTasks()

      const date = await dateOf('Overdue, due Oct 31')
      expect(date).toHaveClass('text-destructive')
      expect(date).not.toHaveClass('line-through')
    })

    it('shows no date span for a task with no date', async () => {
      server.use(...dated([{ id: 1, text: 'Milk', done: true }]))
      renderTasks()

      await screen.findByRole('checkbox', { name: 'Milk' })
      expect(rowOf('Milk').querySelector('time')).toBeNull()
    })
  })

  it('shows the date on the same line, after the task text and before the delete button, never shrinking or wrapping', async () => {
    server.use(...dated([{ id: 1, text: 'Milk', done: false, due_on: '2026-11-05' }]))
    renderTasks()

    const date = await screen.findByText(byWholeText('Due Nov 5'))
    const row = rowOf('Milk')
    const children = Array.from(row.children)
    const text = screen.getByRole('button', { name: 'Edit Milk' })
    const remove = screen.getByRole('button', { name: 'Delete Milk' })
    expect(date.parentElement).toBe(row)
    expect(children.indexOf(text)).toBeLessThan(children.indexOf(date))
    expect(children.indexOf(date)).toBeLessThan(children.indexOf(remove))
    expect(date).toHaveClass('shrink-0', 'whitespace-nowrap')
  })

  it('shows no date, and no secondary text, for a task without one', async () => {
    server.use(...dated([{ id: 1, text: 'Milk', done: false }]))
    renderTasks()

    await screen.findByText('Milk')
    expect(screen.queryByText(/^Due /)).not.toBeInTheDocument()
    expect(rowOf('Milk').querySelector('time')).toBeNull()
  })

  it('keeps the date of a checked task, muted', async () => {
    server.use(...dated([{ id: 1, text: 'Milk', done: true, due_on: '2026-11-05' }]))
    renderTasks()

    const date = await screen.findByText(byWholeText('Due Nov 5'))
    expect(date).toHaveClass('text-muted-foreground')
  })

  it('keeps the date after checking the task', async () => {
    const user = userEvent.setup()
    server.use(...dated([{ id: 1, text: 'Milk', done: false, due_on: '2026-11-05' }]))
    renderTasks()

    await user.click(await screen.findByRole('checkbox', { name: 'Milk' }))
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    expect(screen.getByText(byWholeText('Due Nov 5'))).toBeInTheDocument()
  })
})

describe('setting a due date', () => {
  // The calendar opens on the current month when there is no date, so the clock is pinned: 1 November 2026, a Sunday,
  // at noon in Los Angeles.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 1, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const dated = (tasks: MockTask[]) => [...taskListsHandlers(lists), ...tasksHandlers({ 4: tasks })]
  const byWholeText = (text: string) => (_content: string, element: Element | null) =>
    element?.tagName === 'SPAN' && element.textContent === text
  const trigger = (name = 'Due date for Milk') => screen.getByRole('button', { name })
  const picker = () => screen.queryByRole('dialog', { name: 'Due date for Milk' })
  // A day in the open calendar, by the start of its accessible name ("Thursday, November 5th, 2026").
  const day = (label: string) => within(picker()!).getByRole('button', { name: new RegExp(`^(Today, )?${label}`) })

  async function openPicker(user: ReturnType<typeof userEvent.setup>, name = 'Due date for Milk') {
    await user.click(await screen.findByRole('button', { name }))
    return screen.findByRole('dialog', { name })
  }

  it('gives each row a calendar button named for its task, between the date and the delete button', async () => {
    server.use(...dated([{ id: 1, text: 'Milk', done: false, due_on: '2026-11-05' }]))
    renderTasks()

    const date = await screen.findByText(byWholeText('Due Nov 5'))
    const children = Array.from(date.parentElement!.children)
    const calendar = trigger()
    expect(children.indexOf(date)).toBeLessThan(children.indexOf(calendar))
    expect(children.indexOf(calendar)).toBe(children.length - 2)
    expect(children.at(-1)).toBe(screen.getByRole('button', { name: 'Delete Milk' }))
  })

  it('names a blank task\'s calendar button "Due date for task"', async () => {
    server.use(...dated([{ id: 1, text: '', done: false }]))
    renderTasks()

    expect(await screen.findByRole('button', { name: 'Due date for task' })).toBeInTheDocument()
  })

  it('hides the calendar button only where the device can hover, and keeps it shown while its picker is open', async () => {
    server.use(...dated([{ id: 1, text: 'Milk', done: false }]))
    renderTasks()

    expect(await screen.findByRole('button', { name: 'Due date for Milk' })).toHaveClass(
      'can-hover:opacity-0',
      'group-hover:opacity-100',
      'group-focus-within:opacity-100',
      'focus-visible:opacity-100',
      'data-[state=open]:opacity-100',
    )
  })

  it('is reached with Tab between the task text and the delete button', async () => {
    const user = userEvent.setup()
    server.use(...dated([{ id: 1, text: 'Milk', done: false }]))
    renderTasks()

    ;(await screen.findByRole('button', { name: 'Edit Milk' })).focus()
    await user.tab()
    expect(trigger()).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Delete Milk' })).toHaveFocus()
  })

  it("opens on the current month when the task has no date, with today's day focused", async () => {
    const user = userEvent.setup()
    server.use(...dated([{ id: 1, text: 'Milk', done: false }]))
    renderTasks()

    const dialog = await openPicker(user)
    expect(within(dialog).getByRole('grid', { name: 'November 2026' })).toBeInTheDocument()
    await waitFor(() => expect(day('Sunday, November 1st, 2026')).toHaveFocus())
  })

  it("opens on the due date's month, with that day selected and focused", async () => {
    const user = userEvent.setup()
    server.use(...dated([{ id: 1, text: 'Milk', done: false, due_on: '2027-03-10' }]))
    renderTasks()

    const dialog = await openPicker(user)
    expect(within(dialog).getByRole('grid', { name: 'March 2027' })).toBeInTheDocument()
    const selected = day('Wednesday, March 10th, 2027')
    expect(selected).toHaveAccessibleName('Wednesday, March 10th, 2027, selected')
    await waitFor(() => expect(selected).toHaveFocus())
  })

  it('saves a picked day with a PATCH of only due_on, closes, shows the date and returns focus to the button', async () => {
    const user = userEvent.setup()
    server.use(...dated([{ id: 1, text: 'Milk', done: false }]))
    const sent = recordRequests('patch', '/task_lists/:listId/tasks/:id')
    renderTasks()

    await openPicker(user)
    await user.click(day('Thursday, November 5th, 2026'))

    expect(picker()).not.toBeInTheDocument()
    expect(await screen.findByText(byWholeText('Due Nov 5'))).toBeInTheDocument()
    expect(sent).toEqual([{ path: '/api/v1/task_lists/4/tasks/1', body: { task: { due_on: '2026-11-05' } } }])
    expect(trigger()).toHaveFocus()
  })

  it('saves the day picked, not the day before, late in the evening', async () => {
    // 23:30 in Los Angeles is already the next day in UTC.
    vi.setSystemTime(new Date(2026, 10, 1, 23, 30))
    const user = userEvent.setup()
    server.use(...dated([{ id: 1, text: 'Milk', done: false }]))
    const sent = recordRequests('patch', '/task_lists/:listId/tasks/:id')
    renderTasks()

    await openPicker(user)
    await user.click(day('Sunday, November 1st, 2026'))

    await waitFor(() => expect(sent).toEqual([{ path: '/api/v1/task_lists/4/tasks/1', body: { task: { due_on: '2026-11-01' } } }]))
    expect(await screen.findByText(byWholeText('Due Nov 1'))).toBeInTheDocument()
  })

  it('picks a day with the keyboard', async () => {
    const user = userEvent.setup()
    server.use(...dated([{ id: 1, text: 'Milk', done: false }]))
    const sent = recordRequests('patch', '/task_lists/:listId/tasks/:id')
    renderTasks()

    ;(await screen.findByRole('button', { name: 'Due date for Milk' })).focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(day('Sunday, November 1st, 2026')).toHaveFocus())
    await user.keyboard('{ArrowRight}{ArrowRight}{Enter}')

    expect(await screen.findByText(byWholeText('Due Nov 3'))).toBeInTheDocument()
    expect(sent).toEqual([{ path: '/api/v1/task_lists/4/tasks/1', body: { task: { due_on: '2026-11-03' } } }])
  })

  it('keeps the date after a reload', async () => {
    const user = userEvent.setup()
    server.use(...dated([{ id: 1, text: 'Milk', done: false }]))
    const { unmount } = renderTasks()

    await openPicker(user)
    await user.click(day('Thursday, November 5th, 2026'))
    await screen.findByText(byWholeText('Due Nov 5'))

    unmount()
    queryClient.clear()
    renderTasks()
    expect(await screen.findByText(byWholeText('Due Nov 5'))).toBeInTheDocument()
  })

  it('closes on Escape without saving, and returns focus to the button', async () => {
    const user = userEvent.setup()
    server.use(...dated([{ id: 1, text: 'Milk', done: false }]))
    const sent = recordRequests('patch', '/task_lists/:listId/tasks/:id')
    renderTasks()

    await openPicker(user)
    await user.keyboard('{Escape}')

    await waitFor(() => expect(picker()).not.toBeInTheDocument())
    expect(trigger()).toHaveFocus()
    expect(sent).toEqual([])
  })

  it('sends nothing when the day already set is clicked', async () => {
    const user = userEvent.setup()
    server.use(...dated([{ id: 1, text: 'Milk', done: false, due_on: '2026-11-05' }]))
    const sent = recordRequests('patch', '/task_lists/:listId/tasks/:id')
    renderTasks()

    await openPicker(user)
    await user.click(day('Thursday, November 5th, 2026'))

    expect(picker()).not.toBeInTheDocument()
    expect(sent).toEqual([])
  })

  it.each([
    ['Milk', 'Due date for Milk', "Couldn't save the due date for 'Milk'. Try again."],
    ['', 'Due date for task', "Couldn't save the due date for this task. Try again."],
  ])('shows no date and says so on the line after a failure, for task %j', async (text, name, message) => {
    const user = userEvent.setup()
    server.use(...dated([{ id: 1, text, done: false }]))
    recordRequests('patch', '/task_lists/:listId/tasks/:id', () => new HttpResponse(null, { status: 500 }))
    renderTasks()

    await openPicker(user, name)
    await user.click(within(screen.getByRole('dialog', { name })).getByRole('button', { name: /November 5th, 2026/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByText(/^Due /)).not.toBeInTheDocument()
  })

  it('refreshes the lists and tasks quietly when the task or list was deleted elsewhere (404)', async () => {
    const user = userEvent.setup()
    server.use(...dated([{ id: 1, text: 'Milk', done: false }]))
    const gets = recordTaskGets()
    let listsGets = 0
    server.use(
      http.get(`${API_BASE}/task_lists`, () => {
        listsGets += 1
      }),
    )
    recordRequests('patch', '/task_lists/:listId/tasks/:id', () =>
      HttpResponse.json(errorBody('not_found', 'Not found.'), { status: 404 }),
    )
    renderTasks()

    await openPicker(user)
    await user.click(day('Thursday, November 5th, 2026'))

    await waitFor(() => expect(listsGets).toBe(2))
    await waitFor(() => expect(gets).toEqual(['4', '4']))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not undo a check or an edit made while the date was saving', async () => {
    const user = userEvent.setup()
    const dateAnswer = gate()
    server.use(...dated([{ id: 1, text: 'Milk', done: false }]))
    server.use(
      http.patch(`${API_BASE}/task_lists/:listId/tasks/:id`, async ({ request }) => {
        const body = (await request.clone().json()) as { task: { due_on?: string } }
        if (body.task.due_on === undefined) return undefined
        // The date's answer was read before the check and the edit landed, so it still has the old text and done.
        await dateAnswer.wait()
        return HttpResponse.json({ task: { id: 1, text: 'Milk', done: false, due_on: '2026-11-05' } })
      }),
    )
    renderTasks()

    await openPicker(user)
    await user.click(day('Thursday, November 5th, 2026'))
    await user.click(screen.getByRole('checkbox', { name: 'Milk' }))
    await user.click(screen.getByRole('button', { name: 'Edit Milk' }))
    await user.keyboard('{Control>}a{/Control}Oat milk{Enter}')
    await screen.findByRole('button', { name: 'Edit Oat milk' })
    dateAnswer.open()

    expect(await screen.findByText(byWholeText('Due Nov 5'))).toBeInTheDocument()
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    expect(screen.getByRole('checkbox', { name: 'Oat milk' })).toBeChecked()
  })

  it('sends two quick picks one after the other, in order, and shows the last', async () => {
    const user = userEvent.setup()
    const first = gate()
    const bodies: unknown[] = []
    server.use(...dated([{ id: 1, text: 'Milk', done: false }]))
    server.use(
      http.patch(`${API_BASE}/task_lists/:listId/tasks/:id`, async ({ request }) => {
        bodies.push(await request.clone().json())
        if (bodies.length === 1) await first.wait()
        return undefined
      }),
    )
    renderTasks()

    await openPicker(user)
    await user.click(day('Thursday, November 5th, 2026'))
    await openPicker(user)
    await user.click(day('Friday, November 6th, 2026'))

    expect(bodies).toHaveLength(1) // the second waits for the first to settle
    first.open()
    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies).toEqual([{ task: { due_on: '2026-11-05' } }, { task: { due_on: '2026-11-06' } }])
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    expect(screen.getByText(byWholeText('Due Nov 6'))).toBeInTheDocument()
  })
})

describe('clearing a due date', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 1, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const dated = (tasks: MockTask[]) => [...taskListsHandlers(lists), ...tasksHandlers({ 4: tasks })]
  const byWholeText = (text: string) => (_content: string, element: Element | null) =>
    element?.tagName === 'SPAN' && element.textContent === text
  const picker = () => screen.queryByRole('dialog', { name: 'Due date for Milk' })

  async function openPicker(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Due date for Milk' }))
    return screen.findByRole('dialog', { name: 'Due date for Milk' })
  }

  it('sends due_on: null from "Clear date", closes, removes the date and returns focus to the button', async () => {
    const user = userEvent.setup()
    server.use(...dated([{ id: 1, text: 'Milk', done: false, due_on: '2026-11-05' }]))
    const sent = recordRequests('patch', '/task_lists/:listId/tasks/:id')
    renderTasks()

    const dialog = await openPicker(user)
    await user.click(within(dialog).getByRole('button', { name: 'Clear date' }))

    expect(picker()).not.toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(byWholeText('Due Nov 5'))).not.toBeInTheDocument())
    expect(sent).toEqual([{ path: '/api/v1/task_lists/4/tasks/1', body: { task: { due_on: null } } }])
    expect(screen.getByRole('button', { name: 'Due date for Milk' })).toHaveFocus()
  })

  it('keeps the date cleared after a reload', async () => {
    const user = userEvent.setup()
    server.use(...dated([{ id: 1, text: 'Milk', done: false, due_on: '2026-11-05' }]))
    const { unmount } = renderTasks()

    const dialog = await openPicker(user)
    await user.click(within(dialog).getByRole('button', { name: 'Clear date' }))
    await waitFor(() => expect(screen.queryByText(byWholeText('Due Nov 5'))).not.toBeInTheDocument())
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))

    unmount()
    queryClient.clear()
    renderTasks()
    await screen.findByText('Milk')
    expect(screen.queryByText(/^Due /)).not.toBeInTheDocument()
  })

  it('offers no "Clear date" when the task has no date', async () => {
    const user = userEvent.setup()
    server.use(...dated([{ id: 1, text: 'Milk', done: false }]))
    renderTasks()

    const dialog = await openPicker(user)
    expect(within(dialog).queryByRole('button', { name: 'Clear date' })).not.toBeInTheDocument()
  })

  it('keeps the date and says so on the line when clearing fails', async () => {
    const user = userEvent.setup()
    server.use(...dated([{ id: 1, text: 'Milk', done: false, due_on: '2026-11-05' }]))
    recordRequests('patch', '/task_lists/:listId/tasks/:id', () => new HttpResponse(null, { status: 500 }))
    renderTasks()

    const dialog = await openPicker(user)
    await user.click(within(dialog).getByRole('button', { name: 'Clear date' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save the due date for 'Milk'. Try again.")
    expect(screen.getByText(byWholeText('Due Nov 5'))).toBeInTheDocument()
  })
})
