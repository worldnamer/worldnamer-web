import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setSessionFlag } from '@/auth/sessionFlag'
import { clearAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, refreshHandler } from '@/mocks/handlers'
import { quotesHandlers } from '@/mocks/quotesHandlers'
import { server } from '@/mocks/server'
import { Footer } from './Footer'

beforeEach(() => {
  queryClient.clear()
  clearAccessToken()
  localStorage.clear()
})

function renderFooter() {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the footer', () => {
  it("shows today's quote as text and author when logged in", async () => {
    setSessionFlag()
    server.use(refreshHandler, ...quotesHandlers([{ id: 1, text: 'Hi there', author: 'Ann' }]))
    renderFooter()

    expect(await screen.findByText('Hi there—Ann')).toBeInTheDocument()
  })

  it('shows only the quote text, with no dash, when it has no author', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...quotesHandlers([{ id: 1, text: 'Hi there', author: '' }]))
    renderFooter()

    expect(await screen.findByText('Hi there')).toBeInTheDocument()
    expect(screen.queryByText(/—/)).toBeNull()
  })

  it('cuts a quote longer than 100 characters and keeps the full text in a tooltip', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...quotesHandlers([{ id: 1, text: 'a'.repeat(100), author: 'Ann' }]))
    renderFooter()

    expect(await screen.findByTitle('a'.repeat(100) + '—Ann')).toHaveTextContent('a'.repeat(100) + '…')
  })

  it('keeps the default tagline and makes no quote request when logged out', async () => {
    const requested = vi.fn()
    server.use(
      http.get(`${API_BASE}/quotes/today`, () => {
        requested()
        return HttpResponse.json({ quote: null })
      }),
    )
    renderFooter()

    expect(screen.getByText('I use tech to empower people.')).toBeInTheDocument()
    expect(requested).not.toHaveBeenCalled()
  })

  it('keeps the default tagline when there is no quote today', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...quotesHandlers())
    renderFooter()

    await waitFor(() => expect(queryClient.getQueryData(['quotes', 'today'])).toBeNull())
    expect(screen.getByText('I use tech to empower people.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it("keeps the default tagline when today's quote fails to load", async () => {
    setSessionFlag()
    server.use(
      refreshHandler,
      http.get(`${API_BASE}/quotes/today`, () => new HttpResponse(null, { status: 500 })),
    )
    renderFooter()

    await waitFor(() => expect(queryClient.getQueryState(['quotes', 'today'])?.status).toBe('error'))
    expect(screen.getByText('I use tech to empower people.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
