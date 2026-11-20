import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '@/App'
import { setSessionFlag } from '@/auth/sessionFlag'
import { clearAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, refreshHandler } from '@/mocks/handlers'
import { quotesHandlers } from '@/mocks/quotesHandlers'
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

describe('the Settings page', () => {
  it('renders the Settings page for a logged-in user', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...quotesHandlers())
    renderApp('/settings')

    expect(await screen.findByRole('region', { name: 'Settings page' })).toBeInTheDocument()
  })

  it('shows the not-found page when logged out', async () => {
    renderApp('/settings')

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Settings page' })).not.toBeInTheDocument()
  })

  it("shows today's quote with its author", async () => {
    setSessionFlag()
    server.use(refreshHandler, ...quotesHandlers([{ id: 1, text: 'Hi there', author: 'Ann' }]))
    renderApp('/settings')

    expect(await screen.findByRole('blockquote')).toHaveTextContent('Hi there')
    expect(screen.getByText('— Ann')).toBeInTheDocument()
  })

  it('shows only the quote text when it has no author', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...quotesHandlers([{ id: 1, text: 'Hi there', author: '' }]))
    renderApp('/settings')

    expect(await screen.findByRole('blockquote')).toHaveTextContent('Hi there')
    expect(screen.queryByText(/—/)).not.toBeInTheDocument()
  })

  it('shows Add your first quote when there are no quotes', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...quotesHandlers())
    renderApp('/settings')

    expect(await screen.findByText('Add your first quote')).toBeInTheDocument()
  })

  it("shows a failure message when today's quote cannot be loaded", async () => {
    setSessionFlag()
    server.use(refreshHandler, ...quotesHandlers())
    server.use(http.get(`${API_BASE}/quotes/today`, () => new HttpResponse(null, { status: 500 })))
    renderApp('/settings')

    expect(await screen.findByRole('alert')).toHaveTextContent("Could not load today's quote.")
  })
})
