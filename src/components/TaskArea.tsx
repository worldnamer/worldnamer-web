import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ApiError } from '@/api/client'
import { createTask, deleteTask, listTasks, type Task } from '@/api/tasks'
import type { TaskList } from '@/api/taskLists'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { TaskItem } from '@/components/TaskItem'
import { TaskListNameInput } from '@/components/TaskListNameInput'
import { Button } from '@/components/ui/button'
import { refusal } from '@/lib/refusal'
import { accessibleListName } from '@/lib/taskListNames'
import { isBlankText } from '@/lib/taskText'

// The selected list's tasks, oldest first. Each list's tasks are their own ['tasks', listId] query, so going back to a
// list fetched in the last minute sends no request. Only the selected list is fetched.
//
// The card renders this with key={list.id}, so choosing another list mounts a fresh one: nothing typed for one list
// carries over to the next. There is deliberately no placeholderData either: while the new list loads, the old list's
// tasks must not stay on screen, where a click could land on a task of the wrong list.
//
// `onError` sets the card's error line (null clears it); each save clears it as it starts.
export function TaskArea({ list, onError }: { list: TaskList; onError: (message: string | null) => void }) {
  const queryClient = useQueryClient()
  const { data, isPending, isError } = useQuery({
    queryKey: ['tasks', list.id],
    queryFn: () => listTasks(list.id),
    retry: false, // a down API should show the error at once, not after several retries
    // Tasks fetched in the last minute count as fresh; our own changes write the cache directly.
    staleTime: 60_000,
  })

  const plusRef = useRef<HTMLButtonElement>(null)
  const [drafting, setDrafting] = useState(false)
  const refocusPlus = useRef(false)
  // One delete dialog for the whole area, not one per row. It is controlled: `open` shows it and `target` is the task
  // it asks about. They are separate so the title keeps its text while the dialog fades out.
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<Task | null>(null)
  const opener = useRef<HTMLElement | null>(null) // the delete button that opened the dialog
  const [deletingIds, setDeletingIds] = useState<number[]>([])

  // The + row is replaced by the draft, so focus can only go back to it once the draft has gone.
  useEffect(() => {
    if (!drafting && refocusPlus.current) {
      refocusPlus.current = false
      plusRef.current?.focus()
    }
  }, [drafting])

  // Closes the draft. Focus goes back to the + after Enter or Escape; after a click elsewhere it stays there.
  function closeDraft(refocus: boolean) {
    refocusPlus.current = refocus
    setDrafting(false)
  }

  // The list id is a variable rather than read from `list`, and the cache update uses it, so a save still in flight
  // when another list is chosen lands in the list it was typed into. These callbacks live here, not in each mutate
  // call, so they still run after the area has been replaced by another list's.
  const create = useMutation({
    mutationFn: ({ listId, text }: { listId: number; text: string }) => createTask(listId, text),
    onMutate: () => onError(null),
    onSuccess: (task, { listId }) => {
      queryClient.setQueryData<Task[]>(['tasks', listId], (old) => (old ? [...old, task] : old))
    },
    onError: (e, { listId }) => {
      // A 404 means the list was deleted elsewhere: fetch the lists and its tasks again, quietly, and it goes.
      if (e instanceof ApiError && e.status === 404) {
        void queryClient.invalidateQueries({ queryKey: ['task_lists'] })
        void queryClient.invalidateQueries({ queryKey: ['tasks', listId], exact: true })
        return
      }
      onError(refusal(e) || "Couldn't add the task. Try again.")
    },
  })

  // Pessimistic: the task stays until the server has answered, then leaves the cache. Every other write to a task
  // (edit, check) only updates a task already in the cache, so one still in flight cannot bring this one back. A 204
  // fetches nothing, which would flicker another task's check still in flight; a 404 means the task or its list was
  // already gone, which is what was wanted, so the lists and tasks are fetched again quietly to catch up.
  const remove = useMutation({
    mutationFn: ({ listId, task }: { listId: number; task: Task }) => deleteTask(listId, task.id),
    onMutate: ({ task }) => {
      onError(null)
      setDeletingIds((ids) => [...ids, task.id])
    },
    onSuccess: ({ alreadyGone }, { listId, task }) => {
      queryClient.setQueryData<Task[]>(['tasks', listId], (old) => old?.filter((t) => t.id !== task.id))
      if (alreadyGone) {
        void queryClient.invalidateQueries({ queryKey: ['task_lists'] })
        void queryClient.invalidateQueries({ queryKey: ['tasks', listId], exact: true })
      }
    },
    onError: (_e, { task }) =>
      onError(isBlankText(task.text) ? "Couldn't delete this task. Try again." : `Couldn't delete '${task.text}'. Try again.`),
    onSettled: (_result, _error, { task }) => setDeletingIds((ids) => ids.filter((id) => id !== task.id)),
  })

  function askToDelete(task: Task, button: HTMLElement) {
    opener.current = button
    setTarget(task)
    setOpen(true)
  }

  // Resolves the text as saved, or null if it was not (the card's line says why, and the draft keeps its text).
  async function saveDraft(text: string, viaEnter: boolean) {
    const task = await create.mutateAsync({ listId: list.id, text }).catch(() => null)
    if (task === null) return null
    closeDraft(viaEnter)
    return task.text
  }

  // A fixed height, about ten rows, that scrolls: the card is the same size however many tasks the list has, and
  // while they load. On a phone this is a scroll inside the page's own scroll.
  return (
    <div className="h-72 overflow-y-auto">
      {isPending && <p className="text-sm text-muted-foreground">Loading tasks...</p>}
      {isError && (
        <p role="alert" className="text-sm text-destructive">
          Couldn't load these tasks. Try reloading the page.
        </p>
      )}
      {data && (
        <ul aria-label={`${accessibleListName(list.name)} tasks`} className="grid gap-1">
          {data.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              listId={list.id}
              onError={onError}
              onAskToDelete={askToDelete}
              deleting={deletingIds.includes(task.id)}
            />
          ))}
          {/* The last row, where the next task lands: the + until clicked, then the draft in its place. Focusing the
              draft scrolls it into view, since focus() scrolls the nearest scrolling box. */}
          {drafting ? (
            <li className="flex items-center gap-2">
              {/* Only shows where the box will be; the input is what the user acts on, so it is hidden from
                  screen readers. */}
              <input type="checkbox" aria-hidden="true" className="ml-2 size-4 shrink-0 accent-brand" checked={false} disabled readOnly />
              <TaskListNameInput
                name="New Task"
                label="New task"
                autoFocus
                className="min-w-0 flex-1 focus-visible:ring-inset"
                onSave={saveDraft}
                onCancel={() => closeDraft(true)}
              />
            </li>
          ) : (
            <li>
              <Button ref={plusRef} variant="ghost" size="icon-sm" aria-label="Add task" onClick={() => setDrafting(true)}>
                <PlusIcon />
              </Button>
            </li>
          )}
        </ul>
      )}
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title={target && !isBlankText(target.text) ? `Delete '${target.text}'?` : 'Delete this task?'}
        onConfirm={() => {
          if (target) remove.mutate({ listId: list.id, task: target })
        }}
        // After a confirmed delete the task's own button is going away, so focus goes to the + row; after Cancel it
        // goes back to the button that opened the dialog.
        focusAfterClose={(confirmed) => (confirmed ? plusRef.current : opener.current)}
      />
    </div>
  )
}
