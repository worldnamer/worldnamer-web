import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '@/App'
import { setSessionFlag } from '@/auth/sessionFlag'
import { clearAccessToken } from '@/auth/tokenStore'
import { LAST_RECIPE_KEY } from '@/lib/lastRecipe'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, recipesHandlers, refreshHandler } from '@/mocks/handlers'
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

const recipes = [
  { id: 1, title: 'Bread' },
  { id: 2, title: 'Chili' },
]

const trash = (title: string) => screen.findByRole('button', { name: `Delete ${title}` })
const dialog = () => screen.findByRole('alertdialog')
const confirm = async () => userEvent.click(within(await dialog()).getByRole('button', { name: 'Delete' }))
const path = () => screen.getByLabelText('path')

// Counts the GETs for each recipe id after `armed` is set, on top of the shared handlers.
function countingHandlers(initial = recipes) {
  const [list, show, create, update, destroy] = recipesHandlers(initial)
  const gets: string[] = []
  const counted = http.get(`${API_BASE}/recipes/:id`, (info) => {
    gets.push(String(info.params.id))
    return show.run(info).then((r) => r?.response)
  })
  return { handlers: [list, counted, create, update, destroy], gets }
}

describe('the trash button on a rolodex row', () => {
  it('sits after the title link, named for the recipe', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers(recipes))
    renderApp('/recipes')

    const button = await trash('Bread')
    const row = button.closest('li')!
    expect(within(row).getByRole('link', { name: 'Bread' })).toBeInTheDocument()
    expect(row.children[1]).toBe(button)
  })
})

describe('deleting a recipe', () => {
  it('asks with the recipe\'s name, and Cancel changes nothing and returns focus to the trash button', async () => {
    setSessionFlag()
    let deletes = 0
    const [list, show, create, update, destroy] = recipesHandlers(recipes)
    server.use(
      refreshHandler,
      http.delete(`${API_BASE}/recipes/:id`, (info) => {
        deletes++
        return destroy.run(info).then((r) => r?.response)
      }),
      list,
      show,
      create,
      update,
    )
    renderApp('/recipes/1')

    const button = await trash('Chili')
    await userEvent.click(button)
    const asking = await dialog()
    expect(within(asking).getByText("Delete 'Chili'?")).toBeInTheDocument()
    await userEvent.click(within(asking).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(deletes).toBe(0)
    expect(screen.getByRole('link', { name: 'Chili' })).toBeInTheDocument()
    expect(path()).toHaveTextContent('/recipes/1')
    await waitFor(() => expect(button).toHaveFocus())
  })

  it('removes a recipe that is not selected, leaves the selection alone and focuses Add recipe', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers(recipes))
    renderApp('/recipes/1')

    await screen.findByRole('heading', { name: 'Bread' })
    await userEvent.click(await trash('Chili'))
    await confirm()

    await waitFor(() => expect(screen.queryByRole('link', { name: 'Chili' })).not.toBeInTheDocument())
    expect(path()).toHaveTextContent('/recipes/1')
    expect(screen.getByRole('heading', { name: 'Bread' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bread' })).toHaveAttribute('aria-current', 'page')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add recipe' })).toHaveFocus())
  })

  it('removes the selected recipe and lands on the prompt, with no fetch of it and no jump to another', async () => {
    setSessionFlag()
    const { handlers, gets } = countingHandlers()
    server.use(refreshHandler, ...handlers)
    renderApp('/recipes/1')

    await screen.findByRole('heading', { name: 'Bread' })
    await waitFor(() => expect(localStorage.getItem(LAST_RECIPE_KEY)).toBe('1'))
    gets.length = 0
    await userEvent.click(await trash('Bread'))
    await confirm()

    expect(await screen.findByText('Pick a recipe or add one')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Bread' })).not.toBeInTheDocument())
    expect(path()).toHaveTextContent(/^\/recipes$/)
    expect(screen.queryByRole('region', { name: 'Recipe card' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Chili' })).not.toHaveAttribute('aria-current')
    expect(localStorage.getItem(LAST_RECIPE_KEY)).toBeNull()
    expect(gets).not.toContain('1')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add recipe' })).toHaveFocus())
  })

  it('forgets a saved id that is the deleted recipe even when another recipe is selected', async () => {
    setSessionFlag()
    localStorage.setItem(LAST_RECIPE_KEY, '2')
    server.use(refreshHandler, ...recipesHandlers(recipes))
    renderApp('/recipes/1')

    await screen.findByRole('heading', { name: 'Bread' })
    localStorage.setItem(LAST_RECIPE_KEY, '2') // opening Bread saved 1; put the stale one back
    await userEvent.click(await trash('Chili'))
    await confirm()

    await waitFor(() => expect(screen.queryByRole('link', { name: 'Chili' })).not.toBeInTheDocument())
    expect(localStorage.getItem(LAST_RECIPE_KEY)).toBeNull()
  })

  it('shows one fixed line on a failure, never the server\'s text, and changes nothing', async () => {
    setSessionFlag()
    const [list, show] = recipesHandlers(recipes)
    server.use(
      refreshHandler,
      http.delete(`${API_BASE}/recipes/:id`, () =>
        HttpResponse.json({ error: { code: 'boom', message: 'secret server text' } }, { status: 500 }),
      ),
      list,
      show,
    )
    renderApp('/recipes/1')

    await screen.findByRole('heading', { name: 'Bread' })
    await userEvent.click(await trash('Chili'))
    await confirm()

    const alert = await screen.findByText('Could not delete the recipe. Try again.')
    expect(alert).toHaveAttribute('role', 'alert')
    expect(alert).toHaveClass('text-destructive')
    expect(screen.queryByText(/secret server text/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Chili' })).toBeInTheDocument()
    expect(path()).toHaveTextContent('/recipes/1')
    expect(localStorage.getItem(LAST_RECIPE_KEY)).toBe('1')
  })

  it('on a 404 for a recipe that is not selected, refetches the list quietly and stays put', async () => {
    setSessionFlag()
    const [list, show, , , destroy] = recipesHandlers(recipes)
    server.use(
      refreshHandler,
      http.delete(`${API_BASE}/recipes/2`, async (info) => {
        await destroy.run(info) // gone elsewhere: the next list no longer has it, and this answer is the 404
        return HttpResponse.json({ error: { code: 'not_found', message: 'Not found.' } }, { status: 404 })
      }),
      list,
      show,
    )
    renderApp('/recipes/1')

    await screen.findByRole('heading', { name: 'Bread' })
    await userEvent.click(await trash('Chili'))
    await confirm()

    await waitFor(() => expect(screen.queryByRole('link', { name: 'Chili' })).not.toBeInTheDocument())
    expect(screen.queryByText('Could not delete the recipe. Try again.')).not.toBeInTheDocument()
    expect(path()).toHaveTextContent('/recipes/1')
    expect(screen.getByRole('heading', { name: 'Bread' })).toBeInTheDocument()
  })

  it('on a 404 for the selected recipe, forgets it and goes to /recipes', async () => {
    setSessionFlag()
    const [list, show, , , destroy] = recipesHandlers(recipes)
    server.use(
      refreshHandler,
      http.delete(`${API_BASE}/recipes/1`, async (info) => {
        await destroy.run(info)
        return HttpResponse.json({ error: { code: 'not_found', message: 'Not found.' } }, { status: 404 })
      }),
      list,
      show,
    )
    renderApp('/recipes/1')

    await screen.findByRole('heading', { name: 'Bread' })
    await waitFor(() => expect(localStorage.getItem(LAST_RECIPE_KEY)).toBe('1'))
    await userEvent.click(await trash('Bread'))
    await confirm()

    expect(await screen.findByText('Pick a recipe or add one')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Bread' })).not.toBeInTheDocument())
    expect(path()).toHaveTextContent(/^\/recipes$/)
    expect(localStorage.getItem(LAST_RECIPE_KEY)).toBeNull()
    expect(screen.queryByText('Could not delete the recipe. Try again.')).not.toBeInTheDocument()
  })
})
