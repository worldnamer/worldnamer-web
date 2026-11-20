import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    expect(screen.getByRole('region', { name: 'Quotes' })).toBeInTheDocument()
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

  it('sends the text and author and clears the form after adding', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...quotesHandlers())
    renderApp('/settings')

    const text = await screen.findByRole('textbox', { name: 'Quote' })
    const author = screen.getByRole('textbox', { name: 'Author (optional)' })
    fireEvent.change(text, { target: { value: 'Stay hungry' } })
    fireEvent.change(author, { target: { value: 'Jobs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add quote' }))

    expect(await screen.findByRole('blockquote')).toHaveTextContent('Stay hungry')
    expect(screen.getByText('— Jobs')).toBeInTheDocument()
    expect(text).toHaveValue('')
    expect(author).toHaveValue('')
  })

  it("shows the server's 422 message beside the form and keeps the typed text", async () => {
    setSessionFlag()
    server.use(refreshHandler, ...quotesHandlers())
    renderApp('/settings')

    const text = await screen.findByRole('textbox', { name: 'Quote' })
    const tooLong = 'a'.repeat(501)
    fireEvent.change(text, { target: { value: tooLong } })
    fireEvent.click(screen.getByRole('button', { name: 'Add quote' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Text is too long (maximum is 500 characters).',
    )
    expect(text).toHaveValue(tooLong)
  })

  it('lists the quotes oldest first under a Manage button', async () => {
    setSessionFlag()
    server.use(
      refreshHandler,
      ...quotesHandlers([
        { id: 1, text: 'First one', author: 'Ann' },
        { id: 2, text: 'Second one' },
      ]),
    )
    renderApp('/settings')

    const manage = await screen.findByRole('button', { name: 'Manage' })
    expect(manage).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()

    fireEvent.click(manage)

    expect(manage).toHaveAttribute('aria-expanded', 'true')
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('First one')
    expect(items[1]).toHaveTextContent('Second one')
  })

  it('replaces the empty state with the quote after the first one is added', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...quotesHandlers())
    renderApp('/settings')

    expect(await screen.findByText('Add your first quote')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Quote' }), { target: { value: 'First one' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add quote' }))

    expect(await screen.findByRole('blockquote')).toHaveTextContent('First one')
    expect(screen.queryByText('Add your first quote')).not.toBeInTheDocument()
  })

  it('asks to confirm before deleting a quote and keeps it when cancelled', async () => {
    setSessionFlag()
    server.use(refreshHandler, ...quotesHandlers([{ id: 1, text: 'First one', author: 'Ann' }]))
    renderApp('/settings')

    fireEvent.click(await screen.findByRole('button', { name: 'Manage' }))
    const deleteButton = screen.getByRole('button', { name: 'Delete quote: First one' })
    fireEvent.click(deleteButton)

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Delete this quote?')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(screen.getByRole('listitem')).toHaveTextContent('First one')
    expect(deleteButton).toHaveFocus()
  })

  it('removes a quote from the list once the deletion is confirmed', async () => {
    setSessionFlag()
    server.use(
      refreshHandler,
      ...quotesHandlers([
        { id: 1, text: 'First one', author: 'Ann' },
        { id: 2, text: 'Second one' },
      ]),
    )
    renderApp('/settings')

    fireEvent.click(await screen.findByRole('button', { name: 'Manage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete quote: First one' }))

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Delete this quote?')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByText('First one')).not.toBeInTheDocument())
    expect(screen.getByRole('listitem')).toHaveTextContent('Second one')
  })

  it("shows the next quote as today's after the current one is deleted", async () => {
    setSessionFlag()
    server.use(
      refreshHandler,
      ...quotesHandlers([
        { id: 1, text: 'First one', author: 'Ann' },
        { id: 2, text: 'Second one' },
      ]),
    )
    renderApp('/settings')

    expect(await screen.findByRole('blockquote')).toHaveTextContent('First one')
    fireEvent.click(await screen.findByRole('button', { name: 'Manage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete quote: First one' }))

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Delete this quote?')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.getByRole('blockquote')).toHaveTextContent('Second one'))
    expect(screen.getByRole('blockquote')).not.toHaveTextContent('First one')
  })
})
