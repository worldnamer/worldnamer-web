import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '@/App'
import { setSessionFlag } from '@/auth/sessionFlag'
import { clearAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, refreshHandler, recipesHandlers } from '@/mocks/handlers'
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

  it('puts the rolodex first in the page and in the quarter column from lg, with the card column at half', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers(recipes))
    renderApp('/recipes')

    const page = await screen.findByRole('region', { name: 'Recipes page' })
    expect(page).toHaveClass('flex', 'flex-col', 'gap-4', 'sm:gap-6', 'lg:flex-row', 'lg:items-start')
    const [rolodexColumn, cardColumn] = Array.from(page.children)
    expect(rolodexColumn).toHaveClass('w-full', 'lg:order-last', 'lg:w-1/4')
    expect(cardColumn).toHaveClass('w-full', 'lg:w-1/2')
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

  it('shows the prompt, hidden below lg, when no recipe is selected', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers(recipes))
    renderApp('/recipes')

    const prompt = await screen.findByText('Pick a recipe or add one')
    expect(prompt).toHaveClass('hidden', 'lg:block')
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
    expect(items.map((i) => i.textContent)).toEqual(['500 g flour', 'salt'])
    const prep = within(card).getByText(/Mix\./)
    expect(prep.textContent).toBe('Mix.\nKnead.')
    expect(prep).toHaveClass('whitespace-pre-line')
    const prepLine = within(card).getByRole('heading', { name: 'Prep' }).parentElement!
    expect(prepLine).toHaveClass('flex', 'justify-between', 'border-b')
    expect(within(prepLine).getByText('20 min')).toBeInTheDocument()
    expect(screen.queryByText('Pick a recipe or add one')).not.toBeInTheDocument()
  })

  it('always shows the three areas, with a muted line for each that is empty', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers([{ id: 2, title: 'Water' }]))
    renderApp('/recipes/2')

    const card = await screen.findByRole('region', { name: 'Recipe card' })
    for (const name of ['Ingredients', 'Prep', 'Cook']) {
      expect(within(card).getByRole('heading', { name })).toBeInTheDocument()
    }
    for (const line of ['No ingredients.', 'No prep.', 'No cooking.']) {
      expect(within(card).getByText(line)).toHaveClass('text-muted-foreground')
    }
  })

  it('shows what exists when an area has only a time or only text', async () => {
    setSessionFlag()
    server.use(
      refreshHandler,
      ...recipesHandlers([{ id: 2, title: 'Stew', prep_minutes: 125, cook_instructions: 'Simmer.' }]),
    )
    renderApp('/recipes/2')

    const card = await screen.findByRole('region', { name: 'Recipe card' })
    expect(within(card).getByText('2 hr 5 min')).toBeInTheDocument()
    expect(within(card).getByText('Simmer.')).toBeInTheDocument()
    expect(within(card).queryByText('No prep.')).not.toBeInTheDocument()
    expect(within(card).queryByText('No cooking.')).not.toBeInTheDocument()
    expect(within(card).getByText('No ingredients.')).toBeInTheDocument()
  })

  it('shows no time on the heading line when it is null', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...recipesHandlers([{ id: 2, title: 'Salad', cook_instructions: 'Toss.' }]))
    renderApp('/recipes/2')

    const cookLine = (await screen.findByRole('heading', { name: 'Cook' })).parentElement!
    expect(cookLine.children).toHaveLength(1)
  })

  it('renders markup in recipe text as text', async () => {
    setSessionFlag()
    const title = '<img src=x onerror=alert(1)>'
    server.use(refreshHandler, ...recipesHandlers([{ id: 3, title, prep_instructions: '<b>bold</b> **x**' }]))
    renderApp('/recipes/3')

    const card = await screen.findByRole('region', { name: 'Recipe card' })
    expect(card.querySelector('img, b')).toBeNull()
    expect(within(card).getByText('<b>bold</b> **x**')).toBeInTheDocument()
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
    expect(screen.getByText('Simmer.')).toBeInTheDocument()
  })
})
