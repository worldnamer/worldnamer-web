import { useQuery } from '@tanstack/react-query'
import { listTasks } from '@/api/tasks'
import type { TaskList } from '@/api/taskLists'
import { TaskItem } from '@/components/TaskItem'
import { accessibleListName } from '@/lib/taskListNames'

// The selected list's tasks, oldest first. Each list's tasks are their own ['tasks', listId] query, so going back to a
// list fetched in the last minute sends no request. Only the selected list is fetched.
//
// The card renders this with key={list.id}, so choosing another list mounts a fresh one: nothing typed for one list
// carries over to the next. There is deliberately no placeholderData either: while the new list loads, the old list's
// tasks must not stay on screen, where a click could land on a task of the wrong list.
export function TaskArea({ list }: { list: TaskList }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['tasks', list.id],
    queryFn: () => listTasks(list.id),
    retry: false, // a down API should show the error at once, not after several retries
    // Tasks fetched in the last minute count as fresh; our own changes write the cache directly.
    staleTime: 60_000,
  })

  if (isPending) return <p className="text-sm text-muted-foreground">Loading tasks...</p>
  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn't load these tasks. Try reloading the page.
      </p>
    )
  }
  return (
    <ul aria-label={`${accessibleListName(list.name)} tasks`} className="grid gap-1">
      {data.map((task) => (
        <TaskItem key={task.id} task={task} />
      ))}
    </ul>
  )
}
