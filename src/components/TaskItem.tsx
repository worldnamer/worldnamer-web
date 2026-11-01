import type { Task } from '@/api/tasks'
import { taskName } from '@/lib/taskText'
import { cn } from '@/lib/utils'

// One task: its checkbox, then its text, struck through once checked. A checked task stays where it is in the list.
export function TaskItem({ task }: { task: Task }) {
  return (
    <li className="flex items-start gap-2">
      <input
        type="checkbox"
        aria-label={taskName(task.text)}
        className="mt-2 size-4 shrink-0 accent-brand"
        checked={task.done}
        disabled
        readOnly
      />
      <span className={cn('min-w-0 flex-1 py-1 text-sm break-words', task.done && 'text-muted-foreground line-through')}>
        {task.text}
      </span>
    </li>
  )
}
