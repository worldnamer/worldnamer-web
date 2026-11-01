import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ApiError } from '@/api/client'
import { updateTask, type Task } from '@/api/tasks'
import { TaskListNameInput } from '@/components/TaskListNameInput'
import { refusal } from '@/lib/refusal'
import { isBlankText, taskName } from '@/lib/taskText'
import { cn } from '@/lib/utils'

// One task: its checkbox, then its text, struck through once checked. A checked task stays where it is in the list.
//
// The checkbox saves as soon as it changes. The change shows at once (optimistic) and is put back if the request fails.
//
// The text is a button; clicking it swaps in a text box to edit it in place, with the same Enter, blur and Escape
// behaviour as a list's name. The edit's open state lives here, in the row, so typing re-renders only this task.
// `onError` sets the card's error line.
export function TaskItem({
  task,
  listId,
  onError,
}: {
  task: Task
  listId: number
  onError: (message: string | null) => void
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const editRef = useRef<HTMLButtonElement>(null)
  const refocusEdit = useRef(false)

  // The text button comes back when the box closes, so focus can only go back to it then.
  useEffect(() => {
    if (!editing && refocusEdit.current) {
      refocusEdit.current = false
      editRef.current?.focus()
    }
  }, [editing])

  // Closes the box. Focus goes back to the text after Enter or Escape; after a click elsewhere it stays there.
  function closeEdit(refocus: boolean) {
    refocusEdit.current = refocus
    setEditing(false)
  }

  // The list id is a variable, as for adding a task, so a save still in flight when another list is chosen updates
  // the list the task is in. Callbacks live here rather than in each mutate call, so they still run after this row
  // has gone.
  const edit = useMutation({
    mutationFn: ({ listId, text }: { listId: number; text: string }) => updateTask(listId, task.id, { text }),
    onMutate: () => onError(null),
    onSuccess: (saved, { listId }) => {
      // Only the text is written back. `done` in the answer may be older than a check made since, so it is ignored.
      queryClient.setQueryData<Task[]>(['tasks', listId], (old) =>
        old?.map((t) => (t.id === saved.id ? { ...t, text: saved.text } : t)),
      )
    },
    onError: (e, { listId }) => {
      // A 404 means the task or its list was deleted elsewhere: fetch both again, quietly.
      if (e instanceof ApiError && e.status === 404) {
        void queryClient.invalidateQueries({ queryKey: ['task_lists'] })
        void queryClient.invalidateQueries({ queryKey: ['tasks', listId], exact: true })
        return
      }
      onError(refusal(e) || "Couldn't save the task. Try again.")
    },
  })

  // Set when a check or uncheck fails, so the tasks are fetched again once the last one in flight has settled.
  const toggleFailed = useRef(false)

  const toggle = useMutation({
    mutationKey: ['task-done'],
    // Clicks with the same scope run one after another, in order, so quick clicks on this box reach the server in the
    // order they were made; other tasks still save in parallel. A queued click still runs onMutate at once.
    scope: { id: `task:${task.id}` },
    mutationFn: ({ listId, done }: { listId: number; done: boolean }) => updateTask(listId, task.id, { done }),
    onMutate: async ({ listId, done }) => {
      onError(null)
      // Cancel a fetch of these tasks in flight first, so its older answer cannot overwrite the change shown below.
      await queryClient.cancelQueries({ queryKey: ['tasks', listId], exact: true })
      setDone(listId, done)
      return { wasDone: !done }
    },
    onSuccess: (saved, { listId }) => {
      // Only `done` is written back, never the text, so a check cannot undo an edit. While later clicks on this box are
      // still queued, their change is the one on screen, so the answer is written only for the last of them.
      const queued = queryClient.isMutating({
        mutationKey: ['task-done'],
        predicate: (m) => m.options.scope?.id === `task:${task.id}`,
      })
      if (queued === 1) setDone(listId, saved.done)
    },
    onError: (e, { listId }, context) => {
      // Put the box back at once, without waiting for the refetch.
      setDone(listId, context?.wasDone ?? false)
      toggleFailed.current = true
      // A 404 means the task or its list was deleted elsewhere: fetch the lists again, quietly; the tasks are fetched
      // again below.
      if (e instanceof ApiError && e.status === 404) {
        void queryClient.invalidateQueries({ queryKey: ['task_lists'] })
        return
      }
      onError(isBlankText(task.text) ? "Couldn't save this task. Try again." : `Couldn't save '${task.text}'. Try again.`)
    },
    onSettled: (_saved, _error, { listId }) => {
      // On success the box already shows what the server has, so nothing is fetched. After a failure the request may
      // or may not have landed, so once the last check in flight settles (this one still counts) the tasks are
      // fetched again, once, to show the server's state.
      if (toggleFailed.current && queryClient.isMutating({ mutationKey: ['task-done'] }) === 1) {
        toggleFailed.current = false
        void queryClient.invalidateQueries({ queryKey: ['tasks', listId], exact: true })
      }
    },
  })

  function setDone(listId: number, done: boolean) {
    queryClient.setQueryData<Task[]>(['tasks', listId], (old) =>
      old?.map((t) => (t.id === task.id ? { ...t, done } : t)),
    )
  }

  // Resolves the text as saved, or null if it was not (the card's line says why, and the box keeps its text). Text
  // that would not change once the API strips its spaces is not sent at all.
  async function saveText(text: string, viaEnter: boolean) {
    if (text.trim() === task.text) {
      closeEdit(viaEnter)
      return task.text
    }
    const saved = await edit.mutateAsync({ listId, text }).catch(() => null)
    if (saved === null) return null
    closeEdit(viaEnter)
    return saved.text
  }

  return (
    <li className="flex items-start gap-2">
      <input
        type="checkbox"
        aria-label={taskName(task.text)}
        className="ml-2 mt-2 size-4 shrink-0 cursor-pointer accent-brand"
        checked={task.done}
        onChange={() => toggle.mutate({ listId, done: !task.done })}
      />
      {editing ? (
        <TaskListNameInput
          name={task.text}
          label="Task text"
          autoFocus
          className="min-w-0 flex-1 focus-visible:ring-inset"
          onSave={saveText}
          onCancel={() => closeEdit(true)}
        />
      ) : (
        <button
          ref={editRef}
          type="button"
          aria-label={isBlankText(task.text) ? 'Edit task' : `Edit ${task.text}`}
          // min-w-16 keeps a blank task's text a target worth clicking, and also lets the button shrink below its
          // longest word, so long text wraps inside the area instead of widening it.
          className={cn(
            'min-h-8 min-w-16 flex-1 rounded-md px-1 py-1 text-left text-sm break-words outline-none',
            'focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50',
            task.done && 'text-muted-foreground line-through',
          )}
          onClick={() => setEditing(true)}
        >
          {task.text}
        </button>
      )}
    </li>
  )
}
