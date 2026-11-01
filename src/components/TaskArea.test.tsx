// The tasks area of the Tasks card. The whole card is rendered, since the row chooses the list, with the real
// queryClient and a mock token; the API is the in-memory taskListsHandlers and tasksHandlers unless a test answers a
// request itself.
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, REFRESH_TOKEN, taskListsHandlers, tasksHandlers, type MockTask } from '@/mocks/handlers'
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
