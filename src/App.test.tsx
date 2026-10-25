import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import App from './App'
import { server } from './mocks/server'

const healthUrl = 'http://api.test/api/v1/health'

function renderApp() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  )
}

describe('App', () => {
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
