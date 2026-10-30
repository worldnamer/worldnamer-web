import { useEffect, useRef } from 'react'
import type { TaskList } from '@/api/taskLists'
import { TaskListNameInput } from '@/components/TaskListNameInput'
import { Button } from '@/components/ui/button'

// The editor that replaces the row: one line per list, in order, and a Confirm Lists button that goes back to the
// row. Every change saves as it is made (a name on Enter or when focus leaves its box), so Confirm Lists saves nothing
// itself; pressing it moves focus off a name box, which saves that box. `onRename` resolves the name as saved, or null.
export function TaskListEditor({
  lists,
  onRename,
  onConfirm,
}: {
  lists: TaskList[]
  onRename: (list: TaskList, text: string) => Promise<string | null>
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
        {lists.map((list) => (
          <li key={list.id} className="flex items-center gap-1">
            <TaskListNameInput
              name={list.name}
              className="min-w-0 flex-1"
              onSave={(text) => onRename(list, text)}
            />
          </li>
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
