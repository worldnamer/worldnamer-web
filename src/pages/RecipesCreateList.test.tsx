import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '@/App'
import { setSessionFlag } from '@/auth/sessionFlag'
import { clearAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import {
  API_BASE,
  errorBody,
  googleCalendarHandlers,
  habitsHandlers,
  recipesHandlers,
  refreshHandler,
  taskListsHandlers,
  tasksHandlers,
} from '@/mocks/handlers'
import { server } from '@/mocks/server'

beforeEach(() => {
  queryClient.clear()
  clearAccessToken()
  localStorage.clear()
})

function Probe() {
  return <output aria-label="path">{useLocation().pathname}</output>
}

function renderApp(route: string) {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Probe />
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const stew = {
  id: 1,
  title: 'Stew',
  ingredients: [
    { name: 'beef', amount: '500 g' },
    { name: 'salt', amount: '' },
  ],
}
const empty = { id: 2, title: 'Empty' }

const button = () => screen.findByRole('button', { name: 'Create List' })
const path = () => screen.getByLabelText('path')

// Answers the recipe calls and POST /recipes/:id/task_list. `answer` decides the reply; posts logs what was sent.
function mockCreate(answer: () => Response) {
  const posts: { id: string; body: string }[] = []
  server.use(
    refreshHandler,
    ...recipesHandlers([stew, empty]),
    http.post(`${API_BASE}/recipes/:id/task_list`, async ({ params, request }) => {
      posts.push({ id: String(params.id), body: await request.text() })
      return answer()
    }),
  )
  return posts
}

describe('the Create List button on a recipe card', () => {
  it('is an arrow button titled Create List at the upper right, ahead of the title', async () => {
    setSessionFlag()
    mockCreate(() => HttpResponse.json({ task_list: { id: 7, name: 'Stew' } }, { status: 201 }))
    renderApp('/recipes/1')

    const create = await button()
    expect(create).toHaveAttribute('title', 'Create List')
    expect(create).toBeEnabled()
    expect(create.parentElement).toHaveClass('flex', 'justify-end')
    const heading = screen.getByRole('heading', { name: 'Stew' })
    expect(create.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('is disabled on a recipe with no ingredients, and sends nothing', async () => {
    setSessionFlag()
    const posts = mockCreate(() => HttpResponse.json({ task_list: { id: 7, name: 'Empty' } }, { status: 201 }))
    renderApp('/recipes/2')

    const create = await button()
    expect(create).toBeDisabled()
    await userEvent.click(create)
    expect(posts).toEqual([])
    expect(path()).toHaveTextContent('/recipes/2')
  })

  it('posts with no body, goes home and shows the new list selected with its tasks', async () => {
    setSessionFlag()
    const posts = mockCreate(() => HttpResponse.json({ task_list: { id: 7, name: 'Stew' } }, { status: 201 }))
    // The server's lists already include the one the POST made.
    const existing = taskListsHandlers([{ id: 3, name: 'Chores' }, { id: 7, name: 'Stew' }])
    // Stands in for the API: the list the POST made is the one the home's tasks call then finds.
    server.use(
      ...habitsHandlers(),
      ...googleCalendarHandlers(),
      ...existing,
      ...tasksHandlers({ 3: [], 7: [{ id: 1, text: '500 g beef', done: false }, { id: 2, text: 'salt', done: false }] }),
    )
    renderApp('/recipes/1')
    await userEvent.click(await button())

    await waitFor(() => expect(path()).toHaveTextContent(/^\/$/))
    expect(posts).toEqual([{ id: '1', body: '' }])
    expect(await screen.findByText('500 g beef')).toBeInTheDocument()
    expect(screen.getByText('salt')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Stew', pressed: true })).toBeInTheDocument()
  })

  it('adds the new list to lists already in the cache, before going home', async () => {
    setSessionFlag()
    mockCreate(() => HttpResponse.json({ task_list: { id: 7, name: 'Stew' } }, { status: 201 }))
    server.use(
      ...habitsHandlers(),
      ...googleCalendarHandlers(),
      ...taskListsHandlers([{ id: 3, name: 'Chores' }, { id: 7, name: 'Stew' }]),
      ...tasksHandlers({ 3: [], 7: [] }),
    )
    queryClient.setQueryData(['task_lists'], [{ id: 3, name: 'Chores' }])
    renderApp('/recipes/1')
    await userEvent.click(await button())

    await waitFor(() => expect(path()).toHaveTextContent(/^\/$/))
    expect(queryClient.getQueryData(['task_lists'])).toEqual([
      { id: 3, name: 'Chores' },
      { id: 7, name: 'Stew' },
    ])
  })

  it('shows a message on the card and stays on the recipe when the request fails', async () => {
    setSessionFlag()
    mockCreate(() => HttpResponse.json(errorBody('server_error', 'Boom.'), { status: 500 }))
    renderApp('/recipes/1')
    await userEvent.click(await button())

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't create the list. Try again.")
    expect(path()).toHaveTextContent('/recipes/1')
    expect(screen.getByRole('button', { name: 'Create List' })).toBeEnabled()
  })
})
