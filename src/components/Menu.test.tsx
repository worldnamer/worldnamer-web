import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { Menu } from './Menu'

describe('Menu', () => {
  it('links to Settings from the menu', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Menu username="john" />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Menu' }))

    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  })
})
