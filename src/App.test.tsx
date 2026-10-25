import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import App from './App'
import { server } from './mocks/server'

const healthUrl = 'http://api.test/api/v1/health'

function renderApp(route = '/') {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('home page', () => {
  it('shows OK when the API answers 200', async () => {
    server.use(http.get(healthUrl, () => HttpResponse.json({ status: 'ok', db: 'ok' })))

    renderApp()

    expect(await screen.findByText(/API: OK/)).toBeInTheDocument()
  })

  it('shows the HTTP status when the API answers 503', async () => {
    server.use(
      http.get(healthUrl, () => HttpResponse.json({ status: 'error', db: 'unreachable' }, { status: 503 })),
    )

    renderApp()

    expect(await screen.findByText(/FAILED \(HTTP 503\)/)).toBeInTheDocument()
  })

  it('shows a failure when the API cannot be reached at all', async () => {
    server.use(http.get(healthUrl, () => HttpResponse.error()))

    renderApp()

    expect(await screen.findByText(/FAILED/)).toBeInTheDocument()
  })
})

describe('navigation', () => {
  it('goes to the resume page from the nav', async () => {
    server.use(http.get(healthUrl, () => HttpResponse.json({ status: 'ok', db: 'ok' })))
    renderApp()

    fireEvent.click(screen.getByRole('link', { name: 'Resume' }))

    expect(await screen.findByRole('heading', { name: 'John LeBoeuf-Little' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Resume' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows the resume page when opened directly', () => {
    renderApp('/resume')

    expect(screen.getByRole('heading', { name: 'John LeBoeuf-Little' })).toBeInTheDocument()
  })

  it('shows a not-found page for an unknown address', () => {
    renderApp('/nope')

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
