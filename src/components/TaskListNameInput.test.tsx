// The inline text box shared by list names and task text. Its saving behaviour is tested through the cards that use
// it; here, only what a caller sets on it directly.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TaskListNameInput } from './TaskListNameInput'

const save = () => Promise.resolve('')

describe('TaskListNameInput', () => {
  it('is labelled "List name" by default', () => {
    render(<TaskListNameInput name="Chores" onSave={save} />)

    expect(screen.getByRole('textbox', { name: 'List name' })).toHaveValue('Chores')
  })

  it('takes another label and starts with the text it is given', () => {
    render(<TaskListNameInput label="Task text" name="Milk" onSave={save} />)

    expect(screen.getByRole('textbox', { name: 'Task text' })).toHaveValue('Milk')
    expect(screen.queryByRole('textbox', { name: 'List name' })).not.toBeInTheDocument()
  })
})
