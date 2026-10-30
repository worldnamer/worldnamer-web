// The shared delete confirmation, rendered with a small stand-in caller that holds `open`, like the real ones do. The
// focus callback is given a "after confirm" and an "after cancel" button so each answer can be told apart.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog'

function Caller({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={cancelRef} onClick={() => setOpen(true)}>
        Open
      </button>
      <button ref={confirmRef}>Elsewhere</button>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete 'Stretch'?"
        onConfirm={onConfirm}
        focusAfterClose={(confirmed) => (confirmed ? confirmRef.current : cancelRef.current)}
      />
    </>
  )
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open' }))
  return screen.findByRole('alertdialog', { name: "Delete 'Stretch'?" })
}

describe('ConfirmDeleteDialog', () => {
  it('shows the title, the description and both buttons', async () => {
    const user = userEvent.setup()
    render(<Caller onConfirm={vi.fn()} />)

    const dialog = await openDialog(user)

    expect(within(dialog).getByText("This can't be undone.")).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('calls onConfirm and closes when Delete is pressed', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Caller onConfirm={onConfirm} />)

    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('does not call onConfirm and closes when Cancel is pressed', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Caller onConfirm={onConfirm} />)

    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('moves focus to the element the caller picks for a confirm', async () => {
    const user = userEvent.setup()
    render(<Caller onConfirm={vi.fn()} />)

    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus())
  })

  it('moves focus to the element the caller picks for a cancel, and forgets a confirm on the next open', async () => {
    const user = userEvent.setup()
    render(<Caller onConfirm={vi.fn()} />)

    let dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus())

    dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus())
  })
})
