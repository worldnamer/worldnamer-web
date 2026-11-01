import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ApiError } from '@/api/client'
import { updateTask, type Task } from '@/api/tasks'
import { TaskListNameInput } from '@/components/TaskListNameInput'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDueDate, fromIso, toIso } from '@/lib/isoDate'
import { refusal } from '@/lib/refusal'
import { isBlankText, taskName } from '@/lib/taskText'
import { cn } from '@/lib/utils'

// The row's icons are hidden only where the device can hover, and come back while the row is hovered or holds focus.
// Opacity, not removal, so they keep their space (the text does not jump), stay in the tab order and show when
// focused. Where the device cannot hover (touch) they are always shown.
const revealOnHover =
  'can-hover:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'

// One task, on one line: its checkbox, its text (struck through once checked, and cut with an ellipsis when it does not
// fit), then its due date if it has one. A checked task stays where it is in the list, and keeps its date.
//
// The checkbox saves as soon as it changes. The change shows at once (optimistic) and is put back if the request fails.
//
// The text is a button; clicking it swaps in a text box to edit it in place, with the same Enter, blur and Escape
// behaviour as a list's name. The edit's open state lives here, in the row, so typing re-renders only this task.
// `onError` sets the card's error line.
//
// The calendar button opens a picker; picking a day saves it as the due date and closes the picker, and the date shows
// once the server has answered. The calendar is rendered only while its picker is open, never once per row.
//
// The delete button at the end of the row asks the area to confirm (`onAskToDelete`); the area holds the one dialog
// and the delete itself, and says while it is in flight (`deleting`).
export function TaskItem({
  task,
  listId,
  currentYear,
  onError,
  onAskToDelete,
  deleting,
}: {
  task: Task
  listId: number
  currentYear: number
  onError: (message: string | null) => void
  onAskToDelete: (task: Task, button: HTMLElement) => void
  deleting: boolean
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

  const [picking, setPicking] = useState(false)

  // Pessimistic, unlike the checkbox: the date shows once the server has answered. Picks on this task share a scope,
  // so quick ones reach the server one after another, in the order they were made, and the last one wins.
  const due = useMutation({
    mutationKey: ['task-due'],
    scope: { id: `task-due:${task.id}` },
    mutationFn: ({ listId, dueOn }: { listId: number; dueOn: string | null }) =>
      updateTask(listId, task.id, { due_on: dueOn }),
    onMutate: () => onError(null),
    onSuccess: (saved, { listId }) => {
      // Only the date is written back: the text and `done` in the answer may be older than an edit or check made since.
      queryClient.setQueryData<Task[]>(['tasks', listId], (old) =>
        old?.map((t) => (t.id === saved.id ? { ...t, due_on: saved.due_on } : t)),
      )
    },
    onError: (e, { listId }) => {
      // A 404 means the task or its list was deleted elsewhere: fetch both again, quietly.
      if (e instanceof ApiError && e.status === 404) {
        void queryClient.invalidateQueries({ queryKey: ['task_lists'] })
        void queryClient.invalidateQueries({ queryKey: ['tasks', listId], exact: true })
        return
      }
      onError(
        isBlankText(task.text)
          ? "Couldn't save the due date for this task. Try again."
          : `Couldn't save the due date for '${task.text}'. Try again.`,
      )
    },
  })

  // The calendar hands back local midnight of the day picked; toIso reads that day back without going through UTC.
  // Picking the day already set sends nothing.
  function pickDay(day: Date) {
    setPicking(false)
    const dueOn = toIso(day)
    if (dueOn !== task.due_on) due.mutate({ listId, dueOn })
  }

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

  const dueDateLabel = isBlankText(task.text) ? 'Due date for task' : `Due date for ${task.text}`

  return (
    // `group` lets the row's icons reveal themselves while the row is hovered or holds focus.
    <li className="group flex items-start gap-2">
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
          // The text keeps to one line. flex-1 gives it the room the date and icons leave (so a blank task is still a
          // target worth clicking), min-w-0 lets it be narrower than its text, and truncate cuts what does not fit with
          // an ellipsis instead of widening the area. The full text is in the title, for a mouse, and in the box that
          // clicking opens; touch has no tooltip.
          title={isBlankText(task.text) ? undefined : task.text}
          className={cn(
            'min-h-8 min-w-0 flex-1 truncate rounded-md px-1 py-1 text-left text-sm outline-none',
            'focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50',
            task.done && 'text-muted-foreground line-through',
          )}
          onClick={() => setEditing(true)}
        >
          {task.text}
        </button>
      )}
      {task.due_on && (
        // leading-8 centres the date on the row's 32px line. It never shrinks or wraps; the text gives way instead.
        <span className="shrink-0 text-sm leading-8 whitespace-nowrap text-muted-foreground">
          <span className="sr-only">Due </span>
          <time dateTime={task.due_on}>{formatDueDate(task.due_on, currentYear)}</time>
        </span>
      )}
      <Popover open={picking} onOpenChange={setPicking}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            // While the picker is open, focus is in the picker, outside the row, so the button stays shown by its state.
            className={cn('text-muted-foreground hover:text-foreground', revealOnHover, 'data-[state=open]:opacity-100')}
            aria-label={dueDateLabel}
          >
            <CalendarIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          aria-label={dueDateLabel}
          align="end"
          className="w-auto p-0"
          // Focus goes to the day (the due date, else today) rather than the first button, the month arrow, so the
          // arrow keys move through the days at once.
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <Calendar
            mode="single"
            required
            selected={task.due_on ? fromIso(task.due_on) : undefined}
            // Opens on the due date's month; with none, the calendar opens on the current month itself.
            defaultMonth={task.due_on ? fromIso(task.due_on) : undefined}
            onSelect={pickDay}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn('text-muted-foreground hover:text-foreground', revealOnHover)}
        aria-label={isBlankText(task.text) ? 'Delete task' : `Delete ${task.text}`}
        disabled={deleting}
        onClick={(event) => onAskToDelete(task, event.currentTarget)}
      >
        <Trash2Icon />
      </Button>
    </li>
  )
}
