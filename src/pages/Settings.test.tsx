import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '@/App'
import { setSessionFlag } from '@/auth/sessionFlag'
import { clearAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { refreshHandler } from '@/mocks/handlers'
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
})
