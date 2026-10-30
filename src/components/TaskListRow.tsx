import type { TaskList } from '@/api/taskLists'
import { accessibleListName, isBlank, rowName } from '@/lib/taskListNames'
import { cn } from '@/lib/utils'

// The lists side by side, one box each, in their saved order. Each box is a toggle button; aria-pressed marks the
// selected one. A box has a minimum width, so a blank name is still an empty box to click, and a maximum width; the
// name is cut to a fixed number of characters, with the full name in the native tooltip (title) and the accessible name.
export function TaskListRow({
  lists,
  selectedId,
  onSelect,
}: {
  lists: TaskList[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <ul aria-label="Task lists" className="flex min-w-0 flex-1 gap-2">
        {lists.map((list) => {
          const selected = list.id === selectedId
          return (
            <li key={list.id} className="shrink-0">
              <button
                type="button"
                aria-pressed={selected}
                aria-label={accessibleListName(list.name)}
                title={isBlank(list.name) ? undefined : list.name}
                className={cn(
                  'h-8 min-w-16 max-w-56 truncate rounded-md border px-3 text-sm outline-none transition-colors',
                  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  selected
                    ? 'border-brand bg-brand/15 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
                onClick={() => onSelect(list.id)}
              >
                {rowName(list.name)}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
