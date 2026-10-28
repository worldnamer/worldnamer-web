import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

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
  it('shows the dossier', () => {
    renderApp()

    expect(screen.getByRole('region', { name: 'About John' })).toBeInTheDocument()
  })
})

describe('navigation', () => {
  it('goes to the resume page from the nav', async () => {
    renderApp()

    fireEvent.click(screen.getByRole('link', { name: 'Résumé' }))

    expect(await screen.findByRole('heading', { name: 'John LeBoeuf-Little' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Résumé' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows the resume page when opened directly', () => {
    renderApp('/resume')

    expect(screen.getByRole('heading', { name: 'John LeBoeuf-Little' })).toBeInTheDocument()
    expect(screen.getByText(/openToWork/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Site Reliability Engineer' })).toBeInTheDocument()
    expect(screen.getByText(/Aljex is acquired by Descartes Systems Group/)).toBeInTheDocument()
    expect(screen.getByText(/Phone: available on request/)).toBeInTheDocument()
  })

  it('shows a not-found page for an unknown address', () => {
    renderApp('/nope')

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})

describe('resume cards', () => {
  const descartesBullet = /Led the migration from on-premises infrastructure/
  const fuhuBullet = /Delivered the store in about half a year/
  const fuhuCard = () => screen.getByRole('heading', { name: 'Senior Java Developer and Team Lead' }).closest('article')!
  // A folded card's bullets are inside an `inert` region (clipped to nothing, out of reach of keyboard and readers).
  const isFolded = (bullet: RegExp) => screen.getByText(bullet).closest('[inert]') !== null

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the Descartes bullets and folds the older ones', () => {
    renderApp('/resume')

    expect(isFolded(descartesBullet)).toBe(false)
    expect(isFolded(fuhuBullet)).toBe(true)
  })

  it('opens and folds a card from its own button', () => {
    renderApp('/resume')
    const toggle = within(fuhuCard()).getByRole('button', { name: /Show details/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(toggle)
    expect(isFolded(fuhuBullet)).toBe(false)
    expect(within(fuhuCard()).getByRole('button', { name: /Hide details/ })).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(within(fuhuCard()).getByRole('button', { name: /Hide details/ }))
    expect(isFolded(fuhuBullet)).toBe(true)
  })

  it('shows phrases marked in the summary in the brand color, without the asterisks', () => {
    renderApp('/resume')

    // The footer repeats the mission line, so look only inside the page itself. Which phrases are marked is
    // up to the data file, so this checks the behavior and not the wording.
    const summary = screen.getByRole('main').querySelector('header')!
    expect(summary.querySelectorAll('span.text-brand').length).toBeGreaterThan(0)
    expect(within(summary).queryByText(/\*\*/)).not.toBeInTheDocument()
  })

  it('closes the timeline with the education card', () => {
    renderApp('/resume')

    const card = screen.getByRole('heading', { name: 'Associate of Arts' }).closest('article')!
    expect(within(card).getByText('Rogue Community College')).toBeInTheDocument()
    expect(within(card).getByText('1996 – 1998')).toBeInTheDocument()
  })

  it('keeps the summary and badges of a folded card in view', () => {
    renderApp('/resume')

    expect(screen.getByText(/A greenfield Android application store/)).toBeVisible()
    expect(within(fuhuCard()).getByText('Team Leadership')).toBeVisible()
  })

  it('opens every card with Expand all, and folds them again with Collapse all', () => {
    renderApp('/resume')

    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(isFolded(fuhuBullet)).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))
    expect(isFolded(fuhuBullet)).toBe(true)
    expect(isFolded(descartesBullet)).toBe(true)
  })

  it('opens a folded card when the mouse rests on it for half a second', () => {
    vi.useFakeTimers()
    renderApp('/resume')

    fireEvent.pointerEnter(fuhuCard(), { pointerType: 'mouse' })
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(isFolded(fuhuBullet)).toBe(true)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(isFolded(fuhuBullet)).toBe(false)
  })

  it('does not open a card when the mouse leaves early', () => {
    vi.useFakeTimers()
    renderApp('/resume')

    fireEvent.pointerEnter(fuhuCard(), { pointerType: 'mouse' })
    act(() => {
      vi.advanceTimersByTime(250)
    })
    fireEvent.pointerLeave(fuhuCard(), { pointerType: 'mouse' })
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(isFolded(fuhuBullet)).toBe(true)
  })
})
