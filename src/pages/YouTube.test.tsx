import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '@/App'
import { setSessionFlag } from '@/auth/sessionFlag'
import { clearAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { refreshHandler, youtubeHandlers } from '@/mocks/handlers'
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

describe('the YouTube page', () => {
  it('renders the YouTube page for a logged-in user', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...youtubeHandlers())
    renderApp('/youtube')

    expect(await screen.findByRole('region', { name: 'YouTube page' })).toBeInTheDocument()
  })

  it('shows Not Found and requests nothing when logged out', () => {
    renderApp('/youtube')

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
