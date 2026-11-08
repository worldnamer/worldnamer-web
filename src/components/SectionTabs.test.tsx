import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setSessionFlag } from '@/auth/sessionFlag'
import { clearAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { sections } from '@/lib/sections'
import { refreshHandler } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { Layout } from './Layout'

beforeEach(() => {
  queryClient.clear()
  clearAccessToken()
  localStorage.clear()
})

afterEach(() => {
  queryClient.clear()
})

function renderLayout(route: string) {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Layout>
          <p>page content</p>
        </Layout>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('section tabs', () => {
  it('lists the same sections as the array, as links', async () => {
    setSessionFlag()
    server.use(refreshHandler)
    renderLayout('/resume')

    const tabs = await screen.findByRole('navigation', { name: 'Sections' })
    for (const section of sections) {
      expect(tabs).toContainElement(screen.getByRole('link', { name: section.label }))
      expect(screen.getByRole('link', { name: section.label })).toHaveAttribute('href', section.to)
    }
  })

  it('marks only the tab for the current route', async () => {
    setSessionFlag()
    server.use(refreshHandler)
    renderLayout('/')

    const tabs = await screen.findByRole('navigation', { name: 'Sections' })
    const home = sections.find((section) => section.to === '/')!
    const current = tabs.querySelectorAll('[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent(home.label)
  })

  it.each(['/recipes', '/recipes/5'])('marks only Recipes as current on %s', async (route) => {
    setSessionFlag()
    server.use(refreshHandler)
    renderLayout(route)

    const tabs = await screen.findByRole('navigation', { name: 'Sections' })
    const current = tabs.querySelectorAll('[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Recipes')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('marks no tab on a route that is not a section', async () => {
    setSessionFlag()
    server.use(refreshHandler)
    renderLayout('/resume')

    const tabs = await screen.findByRole('navigation', { name: 'Sections' })
    expect(tabs.querySelector('[aria-current="page"]')).toBeNull()
  })

  it('is hidden below the lg breakpoint and shown from it up', async () => {
    setSessionFlag()
    server.use(refreshHandler)
    renderLayout('/')

    const tabs = await screen.findByRole('navigation', { name: 'Sections' })
    expect(tabs).toHaveClass('hidden', 'lg:flex')
  })

  it('sits after the page content, to its right', async () => {
    setSessionFlag()
    server.use(refreshHandler)
    renderLayout('/')

    const tabs = await screen.findByRole('navigation', { name: 'Sections' })
    const main = screen.getByRole('main')
    expect(main.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('is absent when logged out', () => {
    renderLayout('/')

    expect(screen.getByText('page content')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument()
  })
})
