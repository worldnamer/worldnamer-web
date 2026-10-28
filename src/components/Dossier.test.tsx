import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { resume } from '@/data/resume'
import { Dossier } from './Dossier'

function renderDossier() {
  render(
    <MemoryRouter>
      <Dossier />
    </MemoryRouter>,
  )
}

describe('Dossier', () => {
  it('has all of its text in the page from the start, not added by the animation', () => {
    renderDossier()

    expect(screen.getByText(resume.name)).toBeInTheDocument()
    expect(screen.getByText('Engineering Manager')).toBeInTheDocument()
    expect(screen.getByText(resume.mission)).toBeInTheDocument()
    expect(screen.getByText(/#openToWork/)).toBeInTheDocument()
  })

  it('keeps the phone number redacted', () => {
    renderDossier()

    expect(screen.getByText(/REDACTED, available on request/)).toBeInTheDocument()
  })

  it('links to the résumé page and the outside profiles', () => {
    renderDossier()

    expect(screen.getByRole('link', { name: 'Full résumé' })).toHaveAttribute('href', '/resume')
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute('href', resume.contact.linkedin)
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', resume.contact.github)
  })
})
