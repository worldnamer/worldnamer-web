import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { TaskList } from '@/api/taskLists'
import { TaskListNameInput } from '@/components/TaskListNameInput'
import { Button } from '@/components/ui/button'
import { isBlank } from '@/lib/taskListNames'

// The list's name in quotes for a label, or just "list" when it is blank, so a label never shows empty quotes:
// "Move 'Chores' up", "Move list up".
function quotedName(list: TaskList) {
  return isBlank(list.name) ? 'list' : `'${list.name}'`
}

// One list in the editor: its name box and its up and down arrows.
function EditorLine({
  list,
  index,
  count,
  onRename,
  onMove,
}: {
  list: TaskList
  index: number
  count: number
  onRename: (list: TaskList, text: string) => Promise<string | null>
  onMove: (list: TaskList, by: -1 | 1) => void
}) {
  const upRef = useRef<HTMLButtonElement>(null)
  const downRef = useRef<HTMLButtonElement>(null)
  // The arrow just pressed, until the move shows.
  const moved = useRef<'up' | 'down' | null>(null)

  // Once the list has moved, focus goes back to the arrow that moved it, which React may have taken out of the page
  // and put back while reordering. If that arrow is now disabled (the list reached the top or bottom), focus goes to
  // the other arrow instead.
  useEffect(() => {
    const direction = moved.current
    if (direction === null) return
    moved.current = null
    const same = direction === 'up' ? upRef.current : downRef.current
    const other = direction === 'up' ? downRef.current : upRef.current
    if (same && !same.disabled) {
      same.focus()
    } else {
      other?.focus()
    }
  }, [index])

  function move(direction: 'up' | 'down') {
    moved.current = direction
    onMove(list, direction === 'up' ? -1 : 1)
  }

  return (
    <li className="flex items-center gap-1">
      <TaskListNameInput name={list.name} className="min-w-0 flex-1" onSave={(text) => onRename(list, text)} />
      <Button
        ref={upRef}
        variant="ghost"
        size="icon-sm"
        aria-label={`Move ${quotedName(list)} up`}
        disabled={index === 0}
        onClick={() => move('up')}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        ref={downRef}
        variant="ghost"
        size="icon-sm"
        aria-label={`Move ${quotedName(list)} down`}
        disabled={index === count - 1}
        onClick={() => move('down')}
      >
        <ArrowDownIcon />
      </Button>
    </li>
  )
}

// The editor that replaces the row: one line per list, in order, and a Confirm Lists button that goes back to the
// row. Every change saves as it is made (a name on Enter or when focus leaves its box, an order on each arrow press),
// so Confirm Lists saves nothing itself; pressing it moves focus off a name box, which saves that box. `onRename`
// resolves the name as saved, or null.
export function TaskListEditor({
  lists,
  onRename,
  onMove,
  onConfirm,
}: {
  lists: TaskList[]
  onRename: (list: TaskList, text: string) => Promise<string | null>
  onMove: (list: TaskList, by: -1 | 1) => void
  onConfirm: () => void
}) {
  const groupRef = useRef<HTMLDivElement>(null)

  // The edit button that opened the editor has gone, so focus moves to the editor itself. Not to the first name box,
  // which on a phone would open the on-screen keyboard.
  useEffect(() => {
    groupRef.current?.focus()
  }, [])

  return (
    <div ref={groupRef} role="group" aria-label="Edit lists" tabIndex={-1} className="grid gap-2 outline-none">
      <ul aria-label="Task lists" className="grid gap-1">
        {lists.map((list, index) => (
          <EditorLine
            key={list.id}
            list={list}
            index={index}
            count={lists.length}
            onRename={onRename}
            onMove={onMove}
          />
        ))}
      </ul>
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onConfirm}>
          Confirm Lists
        </Button>
      </div>
    </div>
  )
}
