import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/App'
import { setSessionFlag } from '@/auth/sessionFlag'
import { logout } from '@/api/session'
import { clearAccessToken } from '@/auth/tokenStore'
import { LAST_RECIPE_KEY, clearLastRecipe } from '@/lib/lastRecipe'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, logoutHandler, refreshHandler, recipesHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'

beforeEach(() => {
  queryClient.clear()
  clearAccessToken()
  localStorage.clear()
})

function renderApp(route: string) {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const recipes = [
  { id: 1, title: 'bread' },
  { id: 3, title: 'Apple pie' },
  { id: 2, title: 'Chili' },
]

describe('the Recipes page', () => {
  it('lists the titles in the rolodex, ignoring case, each linking to its recipe', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers(recipes))
    renderApp('/recipes')

    const rolodex = await screen.findByRole('region', { name: 'Recipes' })
    const links = await within(rolodex).findAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Apple pie', 'bread', 'Chili'])
    expect(links[0]).toHaveAttribute('href', '/recipes/3')
  })

  it('shows an empty-state line when there are no recipes', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers())
    renderApp('/recipes')

    expect(await screen.findByText('No recipes yet.')).toBeInTheDocument()
  })

  it('shows a failure line when the list cannot be loaded', async () => {
    setSessionFlag()
    server.use(
      refreshHandler,
      http.get(`${API_BASE}/recipes`, () => HttpResponse.json({}, { status: 500 })),
    )
    renderApp('/recipes')

    expect(await screen.findByText('Could not load recipes.')).toBeInTheDocument()
  })

  it('puts the rolodex before the card column in the page', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers(recipes))
    renderApp('/recipes')

    const page = await screen.findByRole('region', { name: 'Recipes page' })
    const [rolodexColumn, cardColumn] = Array.from(page.children)
    expect(rolodexColumn).not.toBe(cardColumn)
    expect(within(rolodexColumn as HTMLElement).getByRole('region', { name: 'Recipes' })).toBeInTheDocument()
  })

  it('marks the selected title as the current page and moves the mark when another is picked', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers(recipes))
    renderApp('/recipes/1')

    const bread = await screen.findByRole('link', { name: 'bread' })
    expect(bread).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Chili' })).not.toHaveAttribute('aria-current')

    await userEvent.click(screen.getByRole('link', { name: 'Chili' }))
    expect(screen.getByRole('link', { name: 'Chili' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'bread' })).not.toHaveAttribute('aria-current')
  })

  it('shows Page not found and calls no API when logged out', () => {
    // No handlers: an unhandled request would fail the test.
    renderApp('/recipes')

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('shows nothing while the session is being restored', () => {
    setSessionFlag()
    server.use(refreshHandler)
    renderApp('/recipes')

    expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Recipes' })).not.toBeInTheDocument()
  })

  it('shows the prompt when no recipe is selected', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers(recipes))
    renderApp('/recipes')

    const prompt = await screen.findByText('Pick a recipe or add one')
    expect(prompt).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Recipe card' })).not.toBeInTheDocument()
  })
})

describe('the recipe card', () => {
  const bread = {
    id: 1,
    title: 'Bread',
    ingredients: [
      { name: 'flour', amount: '500 g' },
      { name: 'salt', amount: '' },
    ],
    prep_instructions: 'Mix.\nKnead.',
    prep_minutes: 20,
  }

  it('shows the title, ingredients, instructions and the time beside each heading', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers([bread]))
    renderApp('/recipes/1')

    const card = await screen.findByRole('region', { name: 'Recipe card' })
    expect(within(card).getByRole('heading', { name: 'Bread' })).toBeInTheDocument()
    const items = within(card).getAllByRole('listitem')
    expect(items.slice(0, 2).map((i) => i.textContent)).toEqual(['500 g flour', 'salt'])
    expect(within(card).getByRole('button', { name: 'Add ingredient' })).toBeInTheDocument()
    expect(within(card).queryAllByRole('textbox')).toEqual([])
    const prepText = within(card).getByTitle('Edit prep instructions')
    expect(prepText.textContent).toBe('Mix.\nKnead.')
    const prepLine = within(card).getByRole('heading', { name: 'Prep' }).parentElement!
    expect(within(prepLine).getByTitle('Edit prep minutes')).toHaveTextContent('20 min')
    expect(screen.queryByText('Pick a recipe or add one')).not.toBeInTheDocument()
  })

  it('always shows the three areas, with a note and a plus button for no ingredients and prompts for the empty instructions', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers([{ id: 2, title: 'Water' }]))
    renderApp('/recipes/2')

    const card = await screen.findByRole('region', { name: 'Recipe card' })
    for (const name of ['Ingredients', 'Prep', 'Cook']) {
      expect(within(card).getByRole('heading', { name })).toBeInTheDocument()
    }
    expect(within(card).getByText('No ingredients yet.')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Add ingredient' })).toBeInTheDocument()
    expect(within(card).getByTitle('Edit prep instructions')).toHaveTextContent('Add prep instructions')
    expect(within(card).getByTitle('Edit cooking instructions')).toHaveTextContent('Add cooking instructions')
  })

  it('shows what exists when an area has only a time or only text', async () => {
    setSessionFlag()
    server.use(
      refreshHandler,
      ...recipesHandlers([{ id: 2, title: 'Stew', prep_minutes: 125, cook_instructions: 'Simmer.' }]),
    )
    renderApp('/recipes/2')

    const card = await screen.findByRole('region', { name: 'Recipe card' })
    expect(within(card).getByTitle('Edit prep minutes')).toHaveTextContent('2 hr 5 min')
    expect(within(card).getByTitle('Edit cooking instructions')).toHaveTextContent('Simmer.')
    expect(within(card).getByTitle('Edit prep instructions')).toHaveTextContent('Add prep instructions')
    expect(within(card).getByText('No ingredients yet.')).toBeInTheDocument()
  })

  it('shows a prompt on the heading line when a time is null, and none on Ingredients', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers([{ id: 2, title: 'Salad', cook_instructions: 'Toss.' }]))
    renderApp('/recipes/2')

    const cookLine = (await screen.findByRole('heading', { name: 'Cook' })).parentElement!
    expect(within(cookLine).getByTitle('Edit cook minutes')).toHaveTextContent('Add cooking time')
    const prepLine = screen.getByRole('heading', { name: 'Prep' }).parentElement!
    expect(within(prepLine).getByTitle('Edit prep minutes')).toHaveTextContent('Add prep time')
    const ingredientsLine = screen.getByRole('heading', { name: 'Ingredients' }).parentElement!
    expect(ingredientsLine.children).toHaveLength(1)
  })

  it('renders markup in recipe text as text', async () => {
    setSessionFlag()
    const title = '<img src=x onerror=alert(1)>'
    server.use(refreshHandler, ...recipesHandlers([{ id: 3, title, prep_instructions: '<b>bold</b> **x**' }]))
    renderApp('/recipes/3')

    const card = await screen.findByRole('region', { name: 'Recipe card' })
    expect(card.querySelector('img, b')).toBeNull()
    expect(within(card).getByTitle('Edit prep instructions')).toHaveTextContent('<b>bold</b> **x**')
  })

  it('redirects to /recipes on a 404, showing the rolodex and no card, and asks only once', async () => {
    setSessionFlag()
    let asks = 0
    server.use(
      refreshHandler,
      http.get(`${API_BASE}/recipes/9`, () => {
        asks++
        return HttpResponse.json({ error: { code: 'not_found', message: 'Not found.' } }, { status: 404 })
      }),
      ...recipesHandlers([bread]),
    )
    renderApp('/recipes/9')

    expect(await screen.findByText('Pick a recipe or add one')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bread' })).not.toHaveAttribute('aria-current')
    expect(screen.queryByRole('region', { name: 'Recipe card' })).not.toBeInTheDocument()
    expect(asks).toBe(1)
  })

  it('shows a failure line on another error', async () => {
    setSessionFlag()
    server.use(
      refreshHandler,
      http.get(`${API_BASE}/recipes/1`, () => HttpResponse.json({}, { status: 500 })),
      ...recipesHandlers([bread]),
    )
    renderApp('/recipes/1')

    expect(await screen.findByText('Could not load the recipe.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bread' })).toBeInTheDocument()
  })

  it('swaps the card when another title is picked', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers([bread, { id: 2, title: 'Chili', cook_instructions: 'Simmer.' }]))
    renderApp('/recipes/1')

    await screen.findByRole('heading', { name: 'Bread' })
    await userEvent.click(screen.getByRole('link', { name: 'Chili' }))
    expect(await screen.findByRole('heading', { name: 'Chili' })).toBeInTheDocument()
    expect(screen.getByTitle('Edit cooking instructions')).toHaveTextContent('Simmer.')
  })
})

describe('adding a recipe', () => {
  const addButton = () => screen.findByRole('button', { name: 'Add recipe' })

  it('shows the button with a populated, an empty and a failed list', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers(recipes))
    renderApp('/recipes')
    expect(await addButton()).toBeEnabled()
    expect(await screen.findByRole('link', { name: 'Chili' })).toBeInTheDocument()
  })

  it('shows the button with an empty list', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers())
    renderApp('/recipes')
    expect(await addButton()).toBeEnabled()
    expect(await screen.findByText('No recipes yet.')).toBeInTheDocument()
  })

  it('shows the button with a failed list', async () => {
    setSessionFlag()
    server.use(
      refreshHandler,
      http.get(`${API_BASE}/recipes`, () => HttpResponse.json({}, { status: 500 })),
    )
    renderApp('/recipes')
    expect(await addButton()).toBeEnabled()
    expect(await screen.findByText('Could not load recipes.')).toBeInTheDocument()
  })

  it('creates a recipe, opens its card with the empty areas, and lists it in order, highlighted, with no fetch of the card', async () => {
    setSessionFlag()
    let cardGets = 0
    server.use(
      refreshHandler,
      http.get(`${API_BASE}/recipes/:id`, () => {
        cardGets++
        return HttpResponse.json({}, { status: 500 })
      }),
      ...recipesHandlers(recipes),
    )
    renderApp('/recipes')
    await userEvent.click(await addButton())

    const card = await screen.findByRole('region', { name: 'Recipe card' })
    expect(within(card).getByRole('heading', { name: 'New recipe' })).toBeInTheDocument()
    expect(within(card).getByText('No ingredients yet.')).toBeInTheDocument()
    expect(within(card).getByTitle('Edit prep instructions')).toHaveTextContent('Add prep instructions')
    expect(within(card).getByTitle('Edit cooking instructions')).toHaveTextContent('Add cooking instructions')
    const rolodex = screen.getByRole('region', { name: 'Recipes' })
    await waitFor(() =>
      expect(within(rolodex).getAllByRole('link').map((l) => l.textContent)).toEqual([
        'Apple pie',
        'bread',
        'Chili',
        'New recipe',
      ]),
    )
    const added = within(rolodex).getByRole('link', { name: 'New recipe' })
    expect(added).toHaveAttribute('href', '/recipes/4')
    expect(added).toHaveAttribute('aria-current', 'page')
    expect(cardGets).toBe(0)
  })

  it('makes two recipes on two clicks', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers())
    renderApp('/recipes')
    await userEvent.click(await addButton())
    await screen.findByRole('region', { name: 'Recipe card' })
    await userEvent.click(await addButton())

    await waitFor(() => expect(screen.getAllByRole('link', { name: 'New recipe' })).toHaveLength(2))
    const rolodex = screen.getByRole('region', { name: 'Recipes' })
    expect(within(rolodex).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/recipes/1', '/recipes/2'])
  })

  it('disables the button while pending and sends one POST for two synchronous clicks', async () => {
    setSessionFlag()
    let posts = 0
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    const [list, show, create] = recipesHandlers(recipes)
    server.use(
      refreshHandler,
      http.post(`${API_BASE}/recipes`, async (info) => {
        posts++
        await held
        return create.run(info).then((r) => r?.response)
      }),
      list,
      show,
    )
    renderApp('/recipes')
    const button = await addButton()
    button.click()
    button.click()

    const pending = await screen.findByRole('button', { name: 'Adding...' })
    expect(pending).toBeDisabled()
    release()
    await screen.findByRole('region', { name: 'Recipe card' })
    expect(posts).toBe(1)
    expect(await addButton()).toBeEnabled()
  })

  it('shows a fixed failure line on a 500, keeps the URL and list, and clears it on the next click', async () => {
    setSessionFlag()
    let fail = true
    const [list, show, create] = recipesHandlers(recipes)
    server.use(
      refreshHandler,
      http.post(`${API_BASE}/recipes`, (info) =>
        fail
          ? HttpResponse.json({ error: { code: 'boom', message: 'secret server text' } }, { status: 500 })
          : create.run(info).then((r) => r?.response),
      ),
      list,
      show,
    )
    renderApp('/recipes/1')
    await userEvent.click(await addButton())

    const alert = await screen.findByText('Could not add the recipe. Try again.')
    expect(alert).toHaveAttribute('role', 'alert')
    expect(alert).toHaveClass('text-destructive')
    expect(screen.queryByText(/secret server text/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'bread' })).toHaveAttribute('aria-current', 'page')
    expect(within(screen.getByRole('region', { name: 'Recipes' })).getAllByRole('link')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Add recipe' })).toBeEnabled()

    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Add recipe' }))
    await waitFor(() => expect(screen.queryByText('Could not add the recipe. Try again.')).not.toBeInTheDocument())
    expect(await screen.findByRole('heading', { name: 'New recipe' })).toBeInTheDocument()
  })

  it('sends no body and no Content-Type', async () => {
    setSessionFlag()
    let seen: { body: string; type: string | null } | undefined
    const [list, show, create] = recipesHandlers()
    server.use(
      refreshHandler,
      http.post(`${API_BASE}/recipes`, async (info) => {
        seen = { body: await info.request.clone().text(), type: info.request.headers.get('Content-Type') }
        return create.run(info).then((r) => r?.response)
      }),
      list,
      show,
    )
    renderApp('/recipes')
    await userEvent.click(await addButton())
    await screen.findByRole('region', { name: 'Recipe card' })
    expect(seen).toEqual({ body: '', type: null })
  })
})

describe('reopening the last viewed recipe', () => {
  const list = [
    { id: 1, title: 'Bread' },
    { id: 2, title: 'Chili' },
  ]

  // Shows where the router is, and lets a test press Back.
  function Probe() {
    const location = useLocation()
    const navigate = useNavigate()
    return (
      <>
        <output aria-label="path">{location.pathname}</output>
        <button onClick={() => navigate(-1)}>back</button>
      </>
    )
  }

  function renderAt(entries: string[]) {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
          <Probe />
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('remembers the id of a recipe when it opens, and nothing else about it', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers(list))
    renderApp('/recipes/2')

    await screen.findByRole('heading', { name: 'Chili' })
    await waitFor(() => expect(localStorage.getItem(LAST_RECIPE_KEY)).toBe('2'))
  })

  it('opens the saved recipe from /recipes without leaving /recipes in the history', async () => {
    setSessionFlag()
    localStorage.setItem(LAST_RECIPE_KEY, '2')
    server.use(refreshHandler, ...recipesHandlers(list))
    renderAt(['/', '/recipes'])

    expect(await screen.findByRole('heading', { name: 'Chili' })).toBeInTheDocument()
    expect(screen.getByLabelText('path')).toHaveTextContent('/recipes/2')
    await userEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(screen.getByLabelText('path')).toHaveTextContent(/^\/$/)
  })

  it('forgets a saved id that is not in the list and shows the plain page', async () => {
    setSessionFlag()
    localStorage.setItem(LAST_RECIPE_KEY, '9')
    server.use(refreshHandler, ...recipesHandlers(list))
    renderAt(['/recipes'])

    expect(await screen.findByText('Pick a recipe or add one')).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem(LAST_RECIPE_KEY)).toBeNull())
    expect(screen.getByLabelText('path')).toHaveTextContent('/recipes')
    expect(screen.queryByRole('region', { name: 'Recipe card' })).not.toBeInTheDocument()
  })

  it('lets a deep link win over the saved recipe, and saves the one opened', async () => {
    setSessionFlag()
    localStorage.setItem(LAST_RECIPE_KEY, '2')
    server.use(refreshHandler, ...recipesHandlers(list))
    renderAt(['/recipes/1'])

    expect(await screen.findByRole('heading', { name: 'Bread' })).toBeInTheDocument()
    expect(screen.getByLabelText('path')).toHaveTextContent('/recipes/1')
    await waitFor(() => expect(localStorage.getItem(LAST_RECIPE_KEY)).toBe('1'))
  })

  it('ignores a saved value that is not a whole number', async () => {
    setSessionFlag()
    localStorage.setItem(LAST_RECIPE_KEY, '2/../x')
    server.use(refreshHandler, ...recipesHandlers(list))
    renderAt(['/recipes'])

    expect(await screen.findByText('Pick a recipe or add one')).toBeInTheDocument()
    expect(screen.getByLabelText('path')).toHaveTextContent('/recipes')
  })

  it('clears the saved id when the session ends', async () => {
    localStorage.setItem(LAST_RECIPE_KEY, '2')
    server.use(logoutHandler)
    await logout()

    expect(localStorage.getItem(LAST_RECIPE_KEY)).toBeNull()
  })

  it('works when storage cannot be read', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers(list))
    const getItem = Storage.prototype.getItem
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      if (key === LAST_RECIPE_KEY) throw new Error('blocked')
      return getItem.call(this, key)
    })
    renderAt(['/recipes'])

    expect(await screen.findByText('Pick a recipe or add one')).toBeInTheDocument()
    read.mockRestore()
  })

  it('still opens a recipe when storage cannot be written', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers(list))
    const setItem = Storage.prototype.setItem
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === LAST_RECIPE_KEY) throw new Error('full')
      setItem.call(this, key, value)
    })
    renderAt(['/recipes/1'])

    expect(await screen.findByRole('heading', { name: 'Bread' })).toBeInTheDocument()
    write.mockRestore()
  })

  it('does not reopen a recipe that answered 404, even while the list still names it', async () => {
    setSessionFlag()
    localStorage.setItem(LAST_RECIPE_KEY, '1')
    server.use(
      refreshHandler,
      http.get(`${API_BASE}/recipes/1`, () => HttpResponse.json({ error: { code: 'not_found', message: 'Not found.' } }, { status: 404 })),
      ...recipesHandlers(list),
    )
    renderAt(['/recipes/1'])

    expect(await screen.findByText('Pick a recipe or add one')).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem(LAST_RECIPE_KEY)).toBeNull())
    expect(screen.getByLabelText('path')).toHaveTextContent('/recipes')
  })

  it('does not fail to forget when storage cannot be written', () => {
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => clearLastRecipe()).not.toThrow()
    remove.mockRestore()
  })
})
