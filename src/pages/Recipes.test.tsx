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
})
