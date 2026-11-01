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
        className="mt-2 size-4 shrink-0 accent-brand"
        checked={task.done}
        disabled
        readOnly
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
