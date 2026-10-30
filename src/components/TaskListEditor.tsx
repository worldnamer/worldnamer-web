import { useEffect, useRef } from 'react'
import type { TaskList } from '@/api/taskLists'
import { Button } from '@/components/ui/button'

const inputClass =
  'h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

// The editor that replaces the row: one line per list, in order, and a Confirm Lists button that goes back to the
// row. Every change saves as it is made, so Confirm Lists saves nothing itself.
export function TaskListEditor({ lists, onConfirm }: { lists: TaskList[]; onConfirm: () => void }) {
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
            <input type="text" aria-label="List name" readOnly className={inputClass} value={list.name} />
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
